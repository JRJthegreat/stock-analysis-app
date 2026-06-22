// BYOK AI thesis client.
//
// Sends the engine's already-computed numbers (NOT raw company data) plus the
// user's own Anthropic key to the `thesis-proxy` edge function, which calls Opus
// 4.8 with structured output and returns a thesis that cites those figures.
// Network-side, so it lives in `src/data/`. The engine stays pure.

import type { Analysis } from '../engine';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export interface ThesisPoint {
  point: string;
  evidence: string;
}

export interface Thesis {
  verdict: 'Bullish' | 'Neutral' | 'Bearish';
  summary: string;
  bull: ThesisPoint[];
  bear: ThesisPoint[];
  moat: string;
  risks: string[];
  valuationView: string;
}

const round = (n: number | null | undefined): number | null =>
  n == null || Number.isNaN(n) ? null : Math.round(n * 100) / 100;
const pct = (n: number | null | undefined): number | null =>
  n == null || Number.isNaN(n) ? null : Math.round(n * 1000) / 10;

/** Curated, labelled numbers for the prompt — keeps it focused and token-light. */
function compact(a: Analysis) {
  const f = a.financials;
  const m = a.metrics;
  return {
    company: f.name,
    ticker: f.ticker,
    price: round(f.price),
    revenueGrowthPct: pct(f.revenueGrowth),
    marginsPct: {
      gross: pct(m.grossMargin),
      operating: pct(m.operatingMargin),
      net: pct(m.netMargin),
      fcf: pct(m.fcfMargin),
      roe: pct(m.roe),
    },
    multiples: {
      pe: round(m.pe),
      evToEbit: round(m.evToEbit),
      evToEbitda: round(m.evToEbitda),
      priceToFcf: round(m.priceToFcf),
    },
    leverage: { debtToEquity: round(m.debtToEquity), netDebtUsdMillions: round(m.netDebt) },
    dcf: a.dcfRange
      ? {
          base: round(a.dcfRange.base),
          bear: round(a.dcfRange.bear),
          bull: round(a.dcfRange.bull),
          marginOfSafetyPct: pct(a.dcfRange.marginOfSafety),
          verdict: a.dcfRange.verdict,
        }
      : null,
    reverseDcfImpliedGrowthPct: a.reverseDcf?.solved ? pct(a.reverseDcf.impliedGrowth) : null,
    waccPct: pct(a.wacc?.wacc),
    scores: {
      piotroskiOutOf9: a.scores?.piotroski?.score ?? null,
      altmanZDoublePrime: a.scores?.altmanZdd
        ? { score: round(a.scores.altmanZdd.score), zone: a.scores.altmanZdd.zone }
        : null,
      beneishM: a.scores?.beneishM
        ? { mScore: round(a.scores.beneishM.mScore), manipulationFlag: a.scores.beneishM.manipulationFlag }
        : null,
    },
  };
}

/**
 * Generate an AI thesis for the analysis. If `anthropicKey` is omitted the proxy
 * falls back to the shared server-side key, so callers don't need their own.
 * `refresh` bypasses the proxy's per-ticker cache (used by "Regenerate").
 * Resolves to a structured `Thesis`, or rejects with a clean, user-facing Error.
 */
export async function generateThesis(
  analysis: Analysis,
  anthropicKey?: string,
  refresh = false,
): Promise<Thesis> {
  if (!URL || !ANON) {
    throw new Error('Supabase not configured — set NEXT_PUBLIC_SUPABASE_* in .env');
  }

  let res: Response;
  try {
    res = await fetch(`${URL}/functions/v1/thesis-proxy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        analysis: compact(analysis),
        anthropicKey: anthropicKey?.trim() || '',
        refresh,
      }),
    });
  } catch {
    throw new Error('Network error — check your connection and try again.');
  }

  let json: { thesis?: Thesis; error?: string } | null = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok || !json || json.error || !json.thesis) {
    throw new Error(json?.error || `Thesis request failed (${res.status})`);
  }
  return json.thesis;
}
