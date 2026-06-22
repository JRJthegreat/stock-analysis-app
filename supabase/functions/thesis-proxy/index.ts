// thesis-proxy — AI thesis (shared key by default, BYOK override) with cost guards.
//
// By default this uses a SHARED Anthropic key stored as the ANTHROPIC_API_KEY
// function secret — server-side only, NEVER shipped to the browser — so anyone
// using the app can generate a thesis with no setup. If the caller supplies their
// OWN key in the request body, that key takes precedence for their request (their
// quota, not the owner's).
//
// COST GUARDS (matter for a public demo link):
//   1. Per-ticker thesis cache, stored in `fundamentals_cache` under the reserved
//      key `__thesis__#<TICKER>` (TTL THESIS_TTL_HOURS, default 24h). Repeat
//      requests for the same ticker cost $0. `refresh:true` bypasses it.
//   2. Global daily cap on SHARED-key generations, counted in `fundamentals_cache`
//      under `__thesis_count__` ({date,count}). Once THESIS_DAILY_CAP (default 200)
//      is hit, shared generation is refused (BYOK still works). BYOK never counts.
//
// We call Claude Opus 4.8 with STRUCTURED OUTPUT over the engine's already-computed
// numbers. The model is instructed to reason over and CITE the provided figures and
// invent none — the schema enforces shape. Whichever key is used is used transiently
// for the one upstream call and is NEVER logged, cached, or stored.
//
//   POST /thesis-proxy
//     { analysis: {...engine numbers, incl. ticker...}, anthropicKey?: "sk-ant-...", refresh?: boolean }
//   → { thesis, source: "cache" | "anthropic" }  on success, { error } otherwise

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const THESIS_TTL_MS = Number(Deno.env.get("THESIS_TTL_HOURS") ?? "24") * 3_600_000;
const DAILY_CAP = Number(Deno.env.get("THESIS_DAILY_CAP") ?? "200");
const COUNT_KEY = "__thesis_count__";
const thesisKey = (ticker: string) => `__thesis__#${ticker}`;
const today = () => new Date().toISOString().slice(0, 10);

type Supabase = ReturnType<typeof createClient>;

/** Service-role client (bypasses RLS), or null if the env isn't wired. */
function serviceClient(): Supabase | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return url && key ? createClient(url, key) : null;
}

// JSON Schema for the thesis. Every object sets additionalProperties:false (required
// by structured outputs); no length/numeric constraints (unsupported).
const THESIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["Bullish", "Neutral", "Bearish"] },
    summary: { type: "string" },
    bull: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { point: { type: "string" }, evidence: { type: "string" } },
        required: ["point", "evidence"],
      },
    },
    bear: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { point: { type: "string" }, evidence: { type: "string" } },
        required: ["point", "evidence"],
      },
    },
    moat: { type: "string" },
    risks: { type: "array", items: { type: "string" } },
    valuationView: { type: "string" },
  },
  required: ["verdict", "summary", "bull", "bear", "moat", "risks", "valuationView"],
};

const SYSTEM = `You are a disciplined equity research analyst writing a concise, balanced investment thesis for a self-directed retail investor.

ABSOLUTE RULE: every quantitative figure you state MUST come from the DATA provided in the user message. You must NEVER compute, estimate, infer, or invent any number — not a ratio, growth rate, margin, price, or percentage. If a figure is not in the DATA, do not state it. In each \`evidence\` field, cite the specific provided figures you are reasoning from (e.g. "P/E of 39.8x", "Piotroski 8/9", "DCF base $152.73 vs price $298.01").

Reason over the provided figures to build a genuine bull case and bear case, assess the moat qualitatively, list the key risks, and give a verdict (Bullish / Neutral / Bearish). Be specific and grounded — no hype, no generic filler. This is educational analysis, not investment advice or a recommendation to buy or sell.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    // A caller-supplied key wins; otherwise fall back to the shared server secret.
    const userKey = typeof body.anthropicKey === "string" ? body.anthropicKey.trim() : "";
    const usingShared = !userKey;
    const anthropicKey = userKey || Deno.env.get("ANTHROPIC_API_KEY") || "";
    const refresh = body.refresh === true;
    const analysis: unknown = body.analysis;
    if (!anthropicKey) {
      return json({ error: "No Anthropic API key available — add one in Settings." }, 400);
    }
    if (!analysis || typeof analysis !== "object") {
      return json({ error: "Missing analysis data" }, 400);
    }

    const a = analysis as Record<string, unknown>;
    const ticker = typeof a.ticker === "string" ? a.ticker.trim().toUpperCase() : "";
    const supabase = serviceClient();

    // 1) Per-ticker cache (best effort): serve a fresh cached thesis unless refresh.
    if (supabase && ticker && !refresh) {
      try {
        const { data } = await supabase
          .from("fundamentals_cache")
          .select("payload, fetched_at")
          .eq("ticker", thesisKey(ticker))
          .maybeSingle();
        if (data && Date.now() - new Date(data.fetched_at as string).getTime() < THESIS_TTL_MS) {
          return json({ thesis: data.payload, source: "cache" });
        }
      } catch { /* cache read failure → fall through and generate */ }
    }

    // 2) Daily cap — SHARED key only (BYOK runs on the user's own quota).
    if (usingShared && supabase) {
      try {
        const { data } = await supabase
          .from("fundamentals_cache").select("payload").eq("ticker", COUNT_KEY).maybeSingle();
        const c = (data?.payload ?? {}) as { date?: string; count?: number };
        const count = c.date === today() ? (c.count ?? 0) : 0;
        if (count >= DAILY_CAP) {
          return json(
            { error: "Daily limit for free AI theses reached — add your own Anthropic key in Settings to keep going." },
            429,
          );
        }
      } catch { /* counter read failure → fail open (don't block legitimate use) */ }
    }

    // 3) Generate.
    const userContent =
      `Company: ${a.company ?? a.ticker} (${a.ticker}), trading at $${a.price}.\n\n` +
      `DATA — all figures were computed by a deterministic engine. Cite these; invent none:\n` +
      `${JSON.stringify(analysis, null, 2)}\n\n` +
      `Write the investment thesis as the structured object.`;

    const aRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium", format: { type: "json_schema", schema: THESIS_SCHEMA } },
        system: SYSTEM,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!aRes.ok) {
      const errText = await aRes.text().catch(() => "");
      // Soft 200s with { error } so the client surfaces a clean message and the
      // browser console isn't spammed. Never echo the key.
      if (aRes.status === 401) return json({ error: "Invalid Anthropic API key." });
      if (aRes.status === 429) return json({ error: "Anthropic rate limit hit — try again in a moment." });
      return json({ error: `Anthropic error ${aRes.status}: ${errText.slice(0, 180)}` });
    }

    const data = await aRes.json();
    if (data.stop_reason === "refusal") return json({ error: "The model declined to generate this thesis." });

    const textBlock = Array.isArray(data.content)
      ? data.content.find((b: Record<string, unknown>) => b.type === "text")
      : null;
    if (!textBlock?.text) {
      if (data.stop_reason === "max_tokens") return json({ error: "Thesis didn't finish — try again." });
      return json({ error: "No thesis returned." });
    }

    let thesis: unknown;
    try {
      thesis = JSON.parse(textBlock.text as string);
    } catch {
      return json({ error: "Could not parse the thesis output." });
    }

    // 4) Store in cache + bump the shared-key daily counter (both best effort).
    if (supabase && ticker) {
      try {
        await supabase.from("fundamentals_cache")
          .upsert({ ticker: thesisKey(ticker), payload: thesis, fetched_at: new Date().toISOString() });
      } catch { /* ignore cache write errors */ }
    }
    if (usingShared && supabase) {
      try {
        const { data: cur } = await supabase
          .from("fundamentals_cache").select("payload").eq("ticker", COUNT_KEY).maybeSingle();
        const c = (cur?.payload ?? {}) as { date?: string; count?: number };
        const count = c.date === today() ? (c.count ?? 0) : 0;
        await supabase.from("fundamentals_cache")
          .upsert({ ticker: COUNT_KEY, payload: { date: today(), count: count + 1 }, fetched_at: new Date().toISOString() });
      } catch { /* ignore counter write errors */ }
    }

    return json({ thesis, source: "anthropic" });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
