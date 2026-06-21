import {
  DcfRange,
  Financials,
  Valuation,
  ValuationAssumptions,
  Verdict,
  WaccInputs,
  WaccResult,
} from './types';

/** Sensible starting assumptions. The UI lets the user override every one. */
export const DEFAULT_ASSUMPTIONS: ValuationAssumptions = {
  growthRate: 0.08,
  discountRate: 0.09,
  terminalGrowth: 0.025,
  years: 10,
  fadeYears: 0,
};

/** Default CAPM inputs (US large cap, mid-2020s). All decimals. */
export const DEFAULT_WACC_INPUTS: WaccInputs = {
  riskFree: 0.045,
  equityRiskPremium: 0.05,
  taxRate: 0.21,
  beta: 1,
};

function verdictFromUpside(upside: number): Verdict {
  if (upside > 0.15) return 'Undervalued';
  if (upside < -0.15) return 'Overvalued';
  return 'Fairly valued';
}

/**
 * WACC via CAPM.
 *
 *   costOfEquity      = riskFree + beta * equityRiskPremium
 *   costOfDebt        = interestExpense / totalDebt   (fallback 0.05 when no debt)
 *   afterTaxCostOfDebt= costOfDebt * (1 - taxRate)
 *   E = marketCap, D = totalDebt, V = E + D
 *   WACC = E/V * costOfEquity + D/V * afterTaxCostOfDebt
 *
 * `beta` resolution order: explicit input override -> Financials.beta -> 1.
 * The returned WACC is NOT yet clamped to the terminal-growth spread; the DCF
 * applies that clamp (a WACC consumer that wants the raw number gets it here).
 */
export function computeWacc(
  f: Financials,
  inputs: Partial<WaccInputs> = {},
): WaccResult {
  const merged: WaccInputs = {
    ...DEFAULT_WACC_INPUTS,
    ...inputs,
    // beta precedence: explicit input > company beta > default 1.
    beta: inputs.beta ?? f.beta ?? DEFAULT_WACC_INPUTS.beta,
  };

  const marketCap = f.price * f.sharesOutstanding;
  const costOfEquity = merged.riskFree + merged.beta * merged.equityRiskPremium;

  // costOfDebt: interestExpense / totalDebt, fallback 0.05 when no/zero debt.
  const costOfDebt =
    f.totalDebt > 0 && Number.isFinite(f.interestExpense)
      ? f.interestExpense / f.totalDebt
      : 0.05;
  const afterTaxCostOfDebt = costOfDebt * (1 - merged.taxRate);

  const E = marketCap;
  const D = f.totalDebt;
  const V = E + D;
  // Guard V === 0 (no market cap and no debt) — degenerate, fall back to all-equity.
  const weightEquity = V > 0 ? E / V : 1;
  const weightDebt = V > 0 ? D / V : 0;

  const wacc =
    weightEquity * costOfEquity + weightDebt * afterTaxCostOfDebt;

  return {
    costOfEquity,
    costOfDebt,
    afterTaxCostOfDebt,
    weightEquity,
    weightDebt,
    wacc,
    inputs: merged,
  };
}

/**
 * Core engine: present value per share of a multi-stage FCFF DCF.
 *
 * Stage 1: `years` of explicit `growthRate`.
 * Stage 2 (optional): `fadeYears` over which the growth rate fades LINEARLY from
 *   growthRate down to terminalGrowth.
 * Terminal: Gordon growth on the final-year cash flow.
 *
 * EV -> equity bridge: subtract totalDebt, add cash. Per share over shares out.
 *
 * Degenerate-spread guard preserved: the perpetuity denominator is floored at
 * 0.005 so terminalGrowth >= discountRate cannot blow up / go negative.
 */
function dcfPerShare(f: Financials, a: ValuationAssumptions): number {
  const { growthRate, discountRate, terminalGrowth, years } = a;
  const fadeYears = Math.max(0, Math.floor(a.fadeYears ?? 0));

  let pvFcf = 0;
  let cf = f.freeCashFlow;
  let year = 0;

  // Stage 1: explicit constant growth.
  for (let i = 1; i <= years; i++) {
    year++;
    cf = cf * (1 + growthRate);
    pvFcf += cf / Math.pow(1 + discountRate, year);
  }

  // Stage 2: linear fade from growthRate to terminalGrowth over fadeYears.
  for (let j = 1; j <= fadeYears; j++) {
    year++;
    // Interpolate so the last fade year lands exactly on terminalGrowth.
    const t = j / fadeYears; // (0,1]
    const g = growthRate + (terminalGrowth - growthRate) * t;
    cf = cf * (1 + g);
    pvFcf += cf / Math.pow(1 + discountRate, year);
  }

  // Terminal value on the final projected cash flow (`cf`), discounted from `year`.
  const spread = Math.max(discountRate - terminalGrowth, 0.005);
  const terminalValue = (cf * (1 + terminalGrowth)) / spread;
  const pvTerminal = terminalValue / Math.pow(1 + discountRate, year);

  const enterpriseValue = pvFcf + pvTerminal;
  const equityValue = enterpriseValue - f.totalDebt + f.cash;
  return equityValue / f.sharesOutstanding;
}

/**
 * Unlevered DCF (FCFF approximation) — PUBLIC, signature preserved.
 *
 * Now multi-stage capable via the optional `fadeYears` assumption; with the
 * default `fadeYears: 0` it is identical to the original single-stage model, so
 * existing callers and the UI see no behavioural change.
 */
export function runDcf(
  f: Financials,
  a: ValuationAssumptions = DEFAULT_ASSUMPTIONS,
): Valuation {
  const intrinsicValuePerShare = dcfPerShare(f, a);
  const upsideVsPrice = intrinsicValuePerShare / f.price - 1;

  return {
    assumptions: a,
    intrinsicValuePerShare,
    upsideVsPrice,
    verdict: verdictFromUpside(upsideVsPrice),
  };
}

/**
 * Intrinsic value RANGE (bear / base / bull) plus margin of safety.
 *
 * We flex two of the most sensitive levers in opposite directions:
 *   bear: growth - GROWTH_FLEX, discount + DISCOUNT_FLEX  (pessimistic)
 *   base: as supplied
 *   bull: growth + GROWTH_FLEX, discount - DISCOUNT_FLEX  (optimistic)
 *
 * marginOfSafety = (base - price) / base — positive means price sits below the
 * central intrinsic estimate (a cushion). Verdict is threshold-based on the
 * base-case upside, identical thresholds to runDcf.
 */
export function dcfRange(
  f: Financials,
  a: ValuationAssumptions = DEFAULT_ASSUMPTIONS,
  flex: { growth?: number; discount?: number } = {},
): DcfRange {
  const GROWTH_FLEX = flex.growth ?? 0.02; // +/- 2 percentage points
  const DISCOUNT_FLEX = flex.discount ?? 0.01; // -/+ 1 percentage point

  const bearAssumptions: ValuationAssumptions = {
    ...a,
    growthRate: a.growthRate - GROWTH_FLEX,
    discountRate: a.discountRate + DISCOUNT_FLEX,
  };
  const bullAssumptions: ValuationAssumptions = {
    ...a,
    growthRate: a.growthRate + GROWTH_FLEX,
    discountRate: Math.max(a.discountRate - DISCOUNT_FLEX, a.terminalGrowth + 0.005),
  };

  const base = dcfPerShare(f, a);
  const bear = dcfPerShare(f, bearAssumptions);
  const bull = dcfPerShare(f, bullAssumptions);

  const upside = base / f.price - 1;
  const marginOfSafety = base !== 0 ? (base - f.price) / base : 0;

  return {
    bear,
    base,
    bull,
    marginOfSafety,
    verdict: verdictFromUpside(upside),
    assumptions: a,
  };
}

/**
 * Internal helper exported for reverseDcf so it solves on the EXACT same model.
 * Per-share intrinsic value given a flat (single-stage) growth assumption.
 */
export function dcfPerShareForGrowth(
  f: Financials,
  a: ValuationAssumptions,
  growthRate: number,
): number {
  return dcfPerShare(f, { ...a, growthRate, fadeYears: 0 });
}
