import { Analysis, Financials, ValuationAssumptions } from './types';
import { computeMetrics } from './metrics';
import { DEFAULT_ASSUMPTIONS, computeWacc, dcfRange, runDcf } from './valuation';
import { reverseDcf } from './reverseDcf';
import { altmanZ, altmanZdd, beneishM, piotroski } from './scores';
import { ddm } from './dividend';
import { MOCK_FINANCIALS } from './mockData';

/**
 * Run the full pipeline on already-fetched fundamentals.
 *
 * `financials`, `metrics`, `valuation` are computed EXACTLY as before (the UI
 * depends on them). Everything else is additive: WACC, an intrinsic-value range,
 * a reverse DCF, the solvency/quality/manipulation scores, and a DDM.
 */
export function analyzeFinancials(
  f: Financials,
  a: ValuationAssumptions = DEFAULT_ASSUMPTIONS,
): Analysis {
  const wacc = computeWacc(f);

  return {
    // --- unchanged public surface ---
    financials: f,
    metrics: computeMetrics(f),
    valuation: runDcf(f, a),

    // --- additive engine-upgrade outputs ---
    wacc,
    dcfRange: dcfRange(f, a),
    reverseDcf: reverseDcf(f, a),
    scores: {
      altmanZ: altmanZ(f),
      altmanZdd: altmanZdd(f),
      piotroski: piotroski(f),
      beneishM: beneishM(f),
    },
    ddm: ddm(f, a),
  };
}

export function getAvailableTickers(): string[] {
  return Object.keys(MOCK_FINANCIALS);
}

/**
 * MVP entry point: ticker string -> full Analysis (or null if unknown).
 *
 * Currently backed by the in-memory mock. When the data layer lands this becomes
 * async (returns Promise<Analysis>) and pulls live fundamentals — the screen
 * already treats it as a single call, so the change stays contained here.
 */
export function analyzeTicker(
  ticker: string,
  a?: ValuationAssumptions,
): Analysis | null {
  const f = MOCK_FINANCIALS[ticker.trim().toUpperCase()];
  if (!f) return null;
  return analyzeFinancials(f, a);
}
