import { Financials, Metrics } from './types';

/**
 * Safe division. Returns `null` when the denominator is zero / non-finite, so
 * the UI can render "n/a" rather than Infinity or NaN. Used for the metrics
 * added in the engine upgrade (the legacy fields keep their `number` shape).
 */
function div(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

/**
 * Legacy-safe division: returns a `number`, falling back to 0 when undefined.
 * Only used for the original `Metrics` fields that HomeScreen consumes as
 * `number` (changing those to `number | null` would break the UI types).
 */
function divNum(numerator: number, denominator: number): number {
  const r = div(numerator, denominator);
  return r === null ? 0 : r;
}

/**
 * Compute all derived ratios from raw fundamentals.
 *
 * Pure function: same input -> same output, no I/O. This is the kind of code
 * that should be unit-tested and that the AI layer is NEVER allowed to do in
 * its head — the model reasons over these numbers, it does not produce them.
 *
 * Divide-by-zero convention:
 *   - legacy fields (number): guarded with a 0 fallback (preserves UI types).
 *   - new fields (number | null): return null when not computable.
 */
export function computeMetrics(f: Financials): Metrics {
  const marketCap = f.price * f.sharesOutstanding;
  const netDebt = f.totalDebt - f.cash;
  const enterpriseValue = marketCap + netDebt;
  const eps = divNum(f.netIncome, f.sharesOutstanding);

  // ROIC = NOPAT / invested capital.
  // NOPAT = EBIT * (1 - taxRate). We do not carry a per-company effective tax
  // rate in Financials, so we use the statutory 21% US rate as an assumption.
  // ASSUMPTION (flagged): a real effective tax rate from the income statement
  // would be more precise; the FMP mapper can supply incomeTaxExpense/pretax.
  const ASSUMED_TAX_RATE = 0.21;
  const nopat = f.operatingIncome * (1 - ASSUMED_TAX_RATE);
  // Invested capital = total debt + total equity - cash (operating capital).
  const investedCapital = f.totalDebt + f.totalEquity - f.cash;

  const dps = f.dividendPerShare ?? 0;

  return {
    // --- legacy fields (unchanged shape; consumed by HomeScreen) ---
    marketCap,
    enterpriseValue,
    grossMargin: divNum(f.grossProfit, f.revenue),
    operatingMargin: divNum(f.operatingIncome, f.revenue),
    netMargin: divNum(f.netIncome, f.revenue),
    fcfMargin: divNum(f.freeCashFlow, f.revenue),
    roe: divNum(f.netIncome, f.totalEquity),
    netDebt,
    debtToEquity: divNum(f.totalDebt, f.totalEquity),
    eps,
    pe: divNum(f.price, eps),
    evToEbit: divNum(enterpriseValue, f.operatingIncome),
    priceToFcf: divNum(marketCap, f.freeCashFlow),

    // --- added in the engine upgrade (null when not computable) ---
    currentRatio: div(f.currentAssets, f.currentLiabilities),
    quickRatio: div(f.currentAssets - f.inventory, f.currentLiabilities),
    interestCoverage: div(f.operatingIncome, f.interestExpense),
    assetTurnover: div(f.revenue, f.totalAssets),
    roa: div(f.netIncome, f.totalAssets),
    roic: div(nopat, investedCapital),
    evToEbitda: div(enterpriseValue, f.ebitda),
    fcfYield: div(f.freeCashFlow, marketCap),
    dividendYield: dps > 0 ? div(dps, f.price) : null,
    payoutRatio: div(f.dividendsPaid, f.netIncome),
  };
}
