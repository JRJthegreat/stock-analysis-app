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
import { fetchCompanyList, fetchFinancials, fetchPeers, fetchPrices, resolveTicker } from "./simfin.ts";

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

// `createClient`'s generics don't unify between the call site and this alias
// (public vs never schema), so the helpers below take a loose client type — they
// only do simple reads/writes against one table.
// deno-lint-ignore no-explicit-any
type Supabase = any;

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

/** Read a cache row at ANY age (used as the last-resort fallback). */
async function readCacheAnyAge(supabase: Supabase, key: string) {
  const { data } = await supabase
    .from("fundamentals_cache")
    .select("payload, fetched_at")
    .eq("ticker", key)
    .maybeSingle();
  return data ?? null;
}

/** The cached SimFin company list (for peers), refreshing on a long TTL. */
async function getCompanyList(supabase: Supabase, key: string) {
  const cached = await readCache(supabase, COMPANY_LIST_KEY, LIST_TTL_MS);
  if (cached) return cached.payload as any[];
  try {
    const list = await fetchCompanyList(key);
    await supabase
      .from("fundamentals_cache")
      .upsert({ ticker: COMPANY_LIST_KEY, payload: list, fetched_at: new Date().toISOString() });
    return list;
  } catch (e) {
    // A stale list is far better than failing the request: it is ~static data and
    // is only used to resolve names -> tickers and to pick peers.
    const stale = await readCacheAnyAge(supabase, COMPANY_LIST_KEY);
    if (stale) return stale.payload as any[];
    throw e;
  }
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
    // Accept a ticker OR a company name ("MU" or "Micron") — names are resolved to
    // a ticker below via the cached company list. Names carry spaces / & / digits.
    const query = ticker.trim().toUpperCase().replace(/\s+/g, " ");
    kind = kind.toLowerCase();
    if (!/^[A-Z0-9 .&'\-]{1,64}$/.test(query) || !/[A-Z]/.test(query)) {
      return json({ error: "Invalid or missing ticker" }, 400);
    }
    if (!KINDS.includes(kind as Kind)) return json({ error: `Invalid kind: ${kind}` }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // financials keep the bare ticker as cache key (back-compat); prices/peers get a suffix.
    const cacheKeyFor = (t: string) => (kind === "financials" ? t : `${t}#${kind}`);

    const respond = (
      t: string,
      payload: unknown,
      source: "cache" | "simfin" | "cache-stale",
      fetchedAt: string,
    ) => json({ ticker: t, kind, source, fetchedAt, stale: source === "cache-stale", [kind]: payload });

    /**
     * Last line of defence. If SimFin is unreachable or throttling, serve whatever
     * we cached previously — at ANY age — rather than surfacing an error. A slightly
     * stale figure beats a broken page, and it means a ticker we have ever fetched
     * (every default/popular one) can never error on load.
     */
    const serveStaleOrThrow = async (keys: string[], err: unknown) => {
      for (const k of keys) {
        const stale = await readCacheAnyAge(supabase, k);
        if (stale) {
          const t = k.split("#")[0];
          return respond(t, stale.payload, "cache-stale", stale.fetched_at as string);
        }
      }
      throw err;
    };

    // 1) Fast path: the raw query is itself a fresh cache hit (a ticker seen
    //    recently). The common case — no company-list load needed.
    const rawHit = await readCache(supabase, cacheKeyFor(query), TTL_MS);
    if (rawHit) return respond(query, rawHit.payload, "cache", rawHit.fetched_at as string);

    // 2) Cache miss / stale → we need SimFin.
    const simfinKey = Deno.env.get("SIMFIN_API_KEY");
    if (!simfinKey) return json({ error: "SIMFIN_API_KEY not configured" }, 500);

    let symbol = query;
    try {
      // 3) Resolve the query (ticker OR company name) to a canonical ticker via the
      //    cached company list, so "MICRON" → "MU". Falls back to the raw query.
      const companyList = await getCompanyList(supabase, simfinKey);
      symbol = resolveTicker(query, companyList) ?? query;

      // If resolution changed the symbol, its canonical row may already be cached.
      if (symbol !== query) {
        const canonHit = await readCache(supabase, cacheKeyFor(symbol), TTL_MS);
        if (canonHit) return respond(symbol, canonHit.payload, "cache", canonHit.fetched_at as string);
      }

      // 4) Fetch from SimFin (reuse the already-loaded list for peers).
      const payload =
        kind === "financials"
          ? await fetchFinancials(symbol, simfinKey)
          : kind === "prices"
            ? await fetchPrices(symbol, simfinKey)
            : await fetchPeers(symbol, simfinKey, companyList);

      const fetchedAt = new Date().toISOString();
      // 5) Store (best effort).
      await supabase
        .from("fundamentals_cache")
        .upsert({ ticker: cacheKeyFor(symbol), payload, fetched_at: fetchedAt });

      return respond(symbol, payload, "simfin", fetchedAt);
    } catch (e) {
      // SimFin failed (throttled, down, or genuinely has no data). Prefer a stale
      // row for either the resolved symbol or the raw query before erroring.
      return await serveStaleOrThrow(
        symbol === query ? [cacheKeyFor(query)] : [cacheKeyFor(symbol), cacheKeyFor(query)],
        e,
      );
    }
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
