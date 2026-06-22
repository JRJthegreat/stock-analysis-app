// simfin-proxy — holds the SimFin API key server-side, caches per ticker, returns
// to the app. Mirrors fmp-proxy exactly (same kinds, response shapes, caching,
// CORS, soft-200 error pattern) so swapping the data source is invisible to the
// client. The mobile client calls this with the public anon key; the SimFin key
// (SIMFIN_API_KEY secret) never leaves the server.
//
//   GET /simfin-proxy?ticker=AAPL[&kind=financials|prices|peers]
//   POST /simfin-proxy { "ticker": "AAPL", "kind": "financials" }
//
// kind=financials (default) → { financials }   (assembled Financials)
// kind=prices               → { prices }        ([{date, price}], ~180d)
// kind=peers                → { peers }         ([symbol, ...])
//
// LICENSING / RATE LIMITS: SimFin rate-limits hard and forbids bulk
// redistribution of raw data → caching here (per-ticker, not per-user) is the
// key cost lever. TODO(security): SIMFIN_API_KEY stays server-side; never ship
// it in the mobile bundle.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchCompanyList, fetchFinancials, fetchPeers, fetchPrices } from "./simfin.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const TTL_MS = Number(Deno.env.get("CACHE_TTL_HOURS") ?? "24") * 3_600_000;
// The /companies/list payload is huge and ~static — cache it for much longer so
// peers lookups don't refetch ~5000 rows on every miss.
const LIST_TTL_MS = Number(Deno.env.get("COMPANY_LIST_TTL_HOURS") ?? "168") * 3_600_000; // 7d
const COMPANY_LIST_KEY = "__company_list__";

const KINDS = ["financials", "prices", "peers"] as const;
type Kind = (typeof KINDS)[number];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });

type Supabase = ReturnType<typeof createClient>;

/** Read a cache row if present and fresh (within `ttl`), else null. */
async function readCache(supabase: Supabase, key: string, ttl: number) {
  const { data } = await supabase
    .from("fundamentals_cache")
    .select("payload, fetched_at")
    .eq("ticker", key)
    .maybeSingle();
  if (data && Date.now() - new Date(data.fetched_at as string).getTime() < ttl) return data;
  return null;
}

/** The cached SimFin company list (for peers), refreshing on a long TTL. */
async function getCompanyList(supabase: Supabase, key: string) {
  const cached = await readCache(supabase, COMPANY_LIST_KEY, LIST_TTL_MS);
  if (cached) return cached.payload as any[];
  const list = await fetchCompanyList(key);
  await supabase
    .from("fundamentals_cache")
    .upsert({ ticker: COMPANY_LIST_KEY, payload: list, fetched_at: new Date().toISOString() });
  return list;
}

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

    const respond = (payload: unknown, source: "cache" | "simfin", fetchedAt: string) =>
      json({ ticker, kind, source, fetchedAt, [kind]: payload });

    // 1) Serve from cache if fresh.
    const cached = await readCache(supabase, cacheKey, TTL_MS);
    if (cached) return respond(cached.payload, "cache", cached.fetched_at as string);

    // 2) Cache miss / stale → fetch SimFin.
    const simfinKey = Deno.env.get("SIMFIN_API_KEY");
    if (!simfinKey) return json({ error: "SIMFIN_API_KEY not configured" }, 500);

    const payload =
      kind === "financials"
        ? await fetchFinancials(ticker, simfinKey)
        : kind === "prices"
          ? await fetchPrices(ticker, simfinKey)
          : await fetchPeers(ticker, simfinKey, await getCompanyList(supabase, simfinKey));

    const fetchedAt = new Date().toISOString();
    // 3) Store (best effort).
    await supabase
      .from("fundamentals_cache")
      .upsert({ ticker: cacheKey, payload, fetched_at: fetchedAt });

    return respond(payload, "simfin", fetchedAt);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    // "No fundamentals/prices for this symbol" or a SimFin non-2xx (obscure / junk
    // ticker) is a client/data condition, not a server fault — return 200 so the
    // browser console isn't spammed. The client treats any { error } body as a
    // failure regardless of status.
    const dataIssue = /^No fundamentals|^No prices|^SimFin /.test(msg);
    return json({ error: msg }, dataIssue ? 200 : 502);
  }
});
