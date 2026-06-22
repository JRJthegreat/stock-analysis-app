// fmp-proxy — holds the FMP API key server-side, caches per ticker, returns to
// the app. The mobile client calls this with the public anon key; the FMP key
// (FMP_API_KEY secret) never leaves the server.
//
//   GET /fmp-proxy?ticker=AAPL[&kind=financials|prices|peers]
//   POST /fmp-proxy { "ticker": "AAPL", "kind": "financials" }
//
// kind=financials (default) → { financials }   (assembled Financials)
// kind=prices               → { prices }        ([{date, price}], ~180d)
// kind=peers                → { peers }         ([symbol, ...])

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchFinancials, fetchPeers, fetchPrices } from "./fmp.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const TTL_MS = Number(Deno.env.get("CACHE_TTL_HOURS") ?? "24") * 3_600_000;
const KINDS = ["financials", "prices", "peers"] as const;
type Kind = (typeof KINDS)[number];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = new URL(req.url);
    let ticker = url.searchParams.get("ticker") ?? "";
    let kind = url.searchParams.get("kind") ?? "financials";
    if ((!ticker || !url.searchParams.get("kind")) && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      ticker = ticker || body.ticker || "";
      kind = url.searchParams.get("kind") || body.kind || kind;
    }
    ticker = ticker.trim().toUpperCase();
    kind = kind.toLowerCase();
    if (!/^[A-Z.\-]{1,10}$/.test(ticker)) return json({ error: "Invalid or missing ticker" }, 400);
    if (!KINDS.includes(kind as Kind)) return json({ error: `Invalid kind: ${kind}` }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // financials keep the bare ticker as cache key (back-compat); prices/peers get a suffix.
    const cacheKey = kind === "financials" ? ticker : `${ticker}#${kind}`;

    const respond = (payload: unknown, source: "cache" | "fmp", fetchedAt: string) =>
      json({ ticker, kind, source, fetchedAt, [kind]: payload });

    // 1) Serve from cache if fresh.
    const { data: cached } = await supabase
      .from("fundamentals_cache")
      .select("payload, fetched_at")
      .eq("ticker", cacheKey)
      .maybeSingle();

    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS) {
      return respond(cached.payload, "cache", cached.fetched_at);
    }

    // 2) Cache miss / stale → fetch FMP.
    const fmpKey = Deno.env.get("FMP_API_KEY");
    if (!fmpKey) return json({ error: "FMP_API_KEY not configured" }, 500);

    const payload =
      kind === "financials"
        ? await fetchFinancials(ticker, fmpKey)
        : kind === "prices"
          ? await fetchPrices(ticker, fmpKey)
          : await fetchPeers(ticker, fmpKey);

    const fetchedAt = new Date().toISOString();
    // 3) Store (best effort).
    await supabase
      .from("fundamentals_cache")
      .upsert({ ticker: cacheKey, payload, fetched_at: fetchedAt });

    return respond(payload, "fmp", fetchedAt);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    // "No data for this symbol" (FMP has nothing / non-2xx for an obscure ticker, e.g. a junk
    // peer) is a client/data condition, not a server fault — return 200 so the browser console
    // isn't spammed. The client treats any { error } body as a failure regardless of status.
    const dataIssue = /^No fundamentals|^FMP /.test(msg);
    return json({ error: msg }, dataIssue ? 200 : 502);
  }
});
