// Core domain types for the analysis engine.
//
// The engine is UI-agnostic and network-agnostic: plain data in, plain data out.
// That is what lets the exact same code run inside the Expo app today and behind
// a backend API later, without rewriting the math.
//
// CONVENTION: all monetary values are in USD **millions** unless a field name or
// comment says otherwise (e.g. `price`, `dividendPerShare` are per-share USD).
//
// NULL/ZERO CONVENTION for derived ratios (metrics.ts, scores.ts):
//   - When a denominator is zero or undefined we return `null` (NOT NaN) so the
//     UI can render an explicit "n/a" and downstream code can `== null`-check.
//   - The exception is the legacy `Metrics` block whose fields were typed as
//     `number` before this expansion and are consumed directly by HomeScreen;
//     those keep returning `number` (with a guarded 0 fallback) to avoid breaking
//     the UI. New fields use `number | null`.

/**
 * The subset of line items the year-over-year models (Piotroski, Beneish) consume.
 * A `Financials` IS-A superset of this for the current period, and carries a
 * `prior?` snapshot of the previous fiscal year. Splitting it out keeps the
 * two-period models honest about exactly what they read.
 *
 * All values USD millions unless noted.
 */
export interface PeriodFinancials {
  revenue: number;
  costOfGoodsSold: number;
  grossProfit: number; // = revenue - costOfGoodsSold
  sga: number; // selling, general & administrative expense
  operatingIncome: number; // EBIT
  depreciationAmortization: number; // D&A
  ebitda: number; // = operatingIncome + depreciationAmortization (approx)
  netIncome: number;
  operatingCashFlow: number; // CFO
  freeCashFlow: number; // = operatingCashFlow - capex
  capex: number; // capital expenditure (positive magnitude)
  interestExpense: number; // positive magnitude
  totalAssets: number;
  currentAssets: number;
  cash: number; // cash & equivalents (subset of currentAssets)
  receivables: number; // net receivables (subset of currentAssets)
  inventory: number; // (subset of currentAssets)
  ppeNet: number; // net property, plant & equipment
  totalLiabilities: number;
  currentLiabilities: number;
  longTermDebt: number;
  totalDebt: number; // longTermDebt + short-term/current debt
  totalEquity: number;
  retainedEarnings: number;
  sharesOutstanding: number; // millions of shares
  dividendsPaid: number; // total cash dividends paid (positive magnitude)
}

/**
 * Raw fundamentals for one company. Monetary values are TTM / latest fiscal
 * year, USD millions. Extends PeriodFinancials with identity, market data and an
 * optional prior-year snapshot.
 *
 * Which models need what:
 *   - computeMetrics      : current period only.
 *   - runDcf / dcfRange   : freeCashFlow, totalDebt, cash, sharesOutstanding.
 *   - computeWacc         : interestExpense, totalDebt, marketCap, beta.
 *   - reverseDcf          : same as runDcf.
 *   - Altman Z / Z''      : current period only (+ marketCap).
 *   - DDM                 : dividendPerShare OR dividendsPaid, + cost of equity.
 *   - Piotroski F-Score   : REQUIRES `prior` (degrades to 4 single-period signals).
 *   - Beneish M-Score     : REQUIRES `prior` (returns incomplete when missing).
 */
export interface Financials extends PeriodFinancials {
  ticker: string;
  name: string;
  price: number; // current share price, USD
  revenueGrowth: number; // YoY, decimal (0.08 = 8%)
  beta?: number; // levered equity beta vs market; default 1 when absent
  dividendPerShare?: number; // trailing DPS, USD/share (optional)

  /**
   * Previous fiscal year snapshot. REQUIRED for Piotroski and Beneish; those
   * functions degrade gracefully (flagged `incomplete`) when it is missing.
   */
  prior?: PeriodFinancials;
}

/**
 * Derived ratios. All computed deterministically in code — never by an LLM.
 *
 * Legacy fields (consumed by HomeScreen) stay `number`. Fields added in the
 * engine upgrade use `number | null` (null = undefined / divide-by-zero).
 */
export interface Metrics {
  marketCap: number; // USD millions
  enterpriseValue: number; // USD millions
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
  fcfMargin: number;
  roe: number;
  netDebt: number; // USD millions
  debtToEquity: number;
  eps: number;
  pe: number;
  evToEbit: number;
  priceToFcf: number;

  // --- added in the engine upgrade (null when not computable) ---
  currentRatio: number | null;
  quickRatio: number | null; // (currentAssets - inventory) / currentLiabilities
  interestCoverage: number | null; // EBIT / interestExpense
  assetTurnover: number | null; // revenue / totalAssets
  roa: number | null; // netIncome / totalAssets
  roic: number | null; // NOPAT / invested capital
  evToEbitda: number | null;
  fcfYield: number | null; // freeCashFlow / marketCap
  dividendYield: number | null; // DPS / price
  payoutRatio: number | null; // dividends / netIncome
}

export interface ValuationAssumptions {
  growthRate: number; // annual FCF growth during forecast, decimal
  discountRate: number; // WACC / required return, decimal
  terminalGrowth: number; // perpetuity growth, decimal
  years: number; // explicit forecast horizon (stage 1)
  /** Optional stage-2 fade horizon: years over which growth fades to terminal. */
  fadeYears?: number;
}

export type Verdict = 'Undervalued' | 'Fairly valued' | 'Overvalued';

export interface Valuation {
  assumptions: ValuationAssumptions;
  intrinsicValuePerShare: number;
  upsideVsPrice: number; // decimal; positive = trading below intrinsic value
  verdict: Verdict;
}

// ---------------------------------------------------------------------------
// New output structures (all additive on Analysis).
// ---------------------------------------------------------------------------

/** CAPM / WACC inputs. All decimals. */
export interface WaccInputs {
  riskFree: number; // e.g. 0.045
  equityRiskPremium: number; // e.g. 0.05
  taxRate: number; // marginal corporate tax, e.g. 0.21
  beta: number; // overrides Financials.beta when provided
}

export interface WaccResult {
  costOfEquity: number;
  costOfDebt: number;
  afterTaxCostOfDebt: number;
  weightEquity: number; // E / V
  weightDebt: number; // D / V
  wacc: number; // final, clamped to >= terminalGrowth + 0.01 by the DCF
  inputs: WaccInputs;
}

/** A full intrinsic-value range with the central (base) case and margin of safety. */
export interface DcfRange {
  bear: number; // intrinsic value per share, pessimistic
  base: number; // intrinsic value per share, central
  bull: number; // intrinsic value per share, optimistic
  marginOfSafety: number; // (base - price) / base
  verdict: Verdict; // threshold-based on base case upside
  assumptions: ValuationAssumptions; // base-case assumptions used
}

export interface ReverseDcfResult {
  /** Constant FCF growth rate implied by the current price, decimal. */
  impliedGrowth: number | null;
  /** True when bisection converged on a price-matching growth. */
  solved: boolean;
  note?: string; // explanation when unsolved (e.g. price above any plausible value)
}

export type AltmanZone = 'safe' | 'grey' | 'distress';

export interface AltmanResult {
  score: number;
  zone: AltmanZone;
  model: 'Z' | "Z''"; // manufacturing vs general/non-manufacturer
}

export interface PiotroskiSignal {
  name: string;
  passed: boolean;
}

export interface PiotroskiResult {
  /** 0..9, or null when `prior` is missing (only single-period signals scored). */
  score: number | null;
  incomplete: boolean; // true when prior was missing
  signals: PiotroskiSignal[];
}

export interface BeneishResult {
  /** 8-variable M-Score, or null when `prior` is missing. */
  mScore: number | null;
  incomplete: boolean;
  /** M > -1.78 flags possible earnings manipulation. */
  manipulationFlag: boolean;
  components: Record<string, number> | null; // DSRI, GMI, AQI, SGI, DEPI, SGAI, TATA, LVGI
}

export interface Scores {
  altmanZ: AltmanResult; // manufacturing Z
  altmanZdd: AltmanResult; // Z'' non-manufacturer (default to surface in UI)
  piotroski: PiotroskiResult;
  beneishM: BeneishResult;
}

export interface DdmResult {
  applicable: boolean; // false for non-payers or when r <= g
  valuePerShare: number | null;
  costOfEquity: number; // r used (CAPM)
  dividendGrowth: number; // g used
  note?: string;
}

/** Percentile rank (0..1) of the target within a peer set, per multiple. */
export interface CompsResult {
  pe: number | null;
  evToEbit: number | null;
  evToEbitda: number | null;
  priceToFcf: number | null;
}

export interface Analysis {
  // --- unchanged (HomeScreen depends on these exactly) ---
  financials: Financials;
  metrics: Metrics;
  valuation: Valuation;

  // --- additive engine-upgrade outputs ---
  wacc: WaccResult;
  dcfRange: DcfRange;
  reverseDcf: ReverseDcfResult;
  scores: Scores;
  ddm: DdmResult;
}
