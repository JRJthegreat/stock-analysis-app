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

/** Live fundamentals for a ticker → `Financials` the engine can consume. */
export async function fetchFinancials(ticker: string): Promise<Financials> {
  const json = await callProxy(ticker, 'financials');
  return json.financials as Financials;
}

/** ~180-day EOD close series (oldest→newest) for the price sparkline. */
export async function fetchPrices(ticker: string): Promise<PricePoint[]> {
  const json = await callProxy(ticker, 'prices');
  return (json.prices as PricePoint[]) ?? [];
}

/** Up to 6 peer symbols (excluding self) for the comps card. */
export async function fetchPeers(ticker: string): Promise<string[]> {
  const json = await callProxy(ticker, 'peers');
  return (json.peers as string[]) ?? [];
}
