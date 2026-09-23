// Live fundamentals data layer.
//
// This is the ONLY place the app talks to the network. The engine stays pure
// (no fetch/I/O); it consumes the `Financials` we return here. Keep it that way:
// never import anything from this file into `src/engine/`.
//
// Source: the deployed Supabase `simfin-proxy` edge function, which fronts SimFin
// and returns data already shaped for the engine. Three modes: financials, prices, peers.

import type { Financials } from '../engine';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** How long to wait before aborting a hung request. */
const TIMEOUT_MS = 12_000;

/** One end-of-day close, oldest→newest, for the sparkline. */
export interface PricePoint {
  date: string;
  price: number;
}

type Kind = 'financials' | 'prices' | 'peers';

/**
 * Turn a raw proxy/FMP error string into a short, user-facing message.
 * Unknown-symbol style errors become `No data for "<TICKER>"`.
 */
function friendlyError(raw: string | undefined, ticker: string): string {
  const msg = (raw ?? '').trim();
  const lower = msg.toLowerCase();
  if (
    !msg ||
    lower.includes('not found') ||
    lower.includes('unknown symbol') ||
    lower.includes('invalid symbol') ||
    lower.includes('no data') ||
    lower.includes('no fundamentals') ||
    lower.includes('legacy') ||
    lower.includes('does not exist')
  ) {
    return `No data for "${ticker}"`;
  }
  if (
    lower.includes('premium') ||
    lower.includes('subscription') ||
    lower.includes('special endpoint') ||
    lower.includes('not available under')
  ) {
    return `"${ticker}" isn't available on the current data plan.`;
  }
  // Upstream throttling / provider outage. Never show the raw provider text —
  // it leaks internals ("SimFin /companies/... -> HTTP 429 ...") and reads like a
  // bug to the user. This path is retried before it can ever reach the UI.
  if (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('quota') ||
    lower.includes('too many requests') ||
    lower.startsWith('simfin') ||
    /http 5\d\d/.test(lower)
  ) {
    return 'Data provider is busy — retrying in a moment.';
  }
  return msg.length > 140 ? `${msg.slice(0, 137)}...` : msg;
}

/** Shared call into the edge function for a given kind; returns the parsed JSON body. */
async function callProxy(ticker: string, kind: Kind): Promise<Record<string, unknown>> {
  if (!URL || !ANON) {
    throw new Error('Supabase not configured — set NEXT_PUBLIC_SUPABASE_* in .env');
  }

  const symbol = ticker.trim().toUpperCase();
  const endpoint = `${URL}/functions/v1/simfin-proxy?ticker=${encodeURIComponent(symbol)}&kind=${kind}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ANON}`, apikey: ANON },
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Request timed out — check your connection and try again.');
    }
    throw new Error('Network error — check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }

  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }

  if (!res.ok || !json || 'error' in json) {
    const raw = json && typeof json.error === 'string' ? json.error : `Request failed (${res.status})`;
    throw new Error(friendlyError(raw, symbol));
  }
  return json;
}

/**
 * True when an error is worth retrying (provider throttling / transient network),
 * as opposed to a real "this ticker has no data" answer.
 */
function isTransient(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    m.includes('busy') ||
    m.includes('timed out') ||
    m.includes('network error') ||
    m.includes('request failed')
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Call the proxy, retrying transient failures with backoff. The proxy already
 * retries SimFin internally and falls back to stale cache, so reaching the final
 * throw here means a genuine data problem, not a blip.
 */
async function callProxyWithRetry(
  ticker: string,
  kind: Kind,
  attempts = 3,
): Promise<Record<string, unknown>> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await callProxy(ticker, kind);
    } catch (e) {
      last = e;
      if (!isTransient(e) || i === attempts - 1) throw e;
      await sleep(600 * 2 ** i + Math.random() * 200); // ~0.6s, 1.2s
    }
  }
  throw last;
}

/** Live fundamentals for a ticker → `Financials` the engine can consume. */
export async function fetchFinancials(ticker: string): Promise<Financials> {
  const json = await callProxyWithRetry(ticker, 'financials');
  return json.financials as Financials;
}

/** ~180-day EOD close series (oldest→newest) for the price sparkline. */
export async function fetchPrices(ticker: string): Promise<PricePoint[]> {
  const json = await callProxyWithRetry(ticker, 'prices');
  return (json.prices as PricePoint[]) ?? [];
}

/** Up to 6 peer symbols (excluding self) for the comps card. */
export async function fetchPeers(ticker: string): Promise<string[]> {
  const json = await callProxy(ticker, 'peers');
  return (json.peers as string[]) ?? [];
}
