import { Financials, PeriodFinancials } from '../types';

/**
 * Controlled, round-number fixtures used to lock the math with hand-computed
 * expectations. These are deliberately NOT the mock company data — small,
 * memorable numbers make the expected values easy to verify by hand.
 */

/**
 * DCF/WACC fixture. Round numbers chosen so the present values are exact:
 *   freeCashFlow=100, debt=200, cash=50, shares=100, price set near base value.
 * With g=10%, r=10%, tg=2%, years=3: intrinsic value/share = 14.25 (hand-checked).
 */
export const DCF_FIXTURE: Financials = {
  ticker: 'TEST',
  name: 'Test DCF Co',
  price: 14.25,
  beta: 1.2,
  revenue: 1000,
  costOfGoodsSold: 600,
  grossProfit: 400,
  sga: 100,
  operatingIncome: 200,
  depreciationAmortization: 50,
  ebitda: 250,
  netIncome: 120,
  operatingCashFlow: 140,
  freeCashFlow: 100,
  capex: 40,
  interestExpense: 10,
  totalAssets: 2000,
  currentAssets: 800,
  cash: 50,
  receivables: 200,
  inventory: 150,
  ppeNet: 600,
  totalLiabilities: 900,
  currentLiabilities: 400,
  longTermDebt: 150,
  totalDebt: 200,
  totalEquity: 1100,
  retainedEarnings: 700,
  sharesOutstanding: 100,
  dividendsPaid: 0,
  revenueGrowth: 0.1,
};

/**
 * WACC fixture: marketCap = price(10) * shares(1000) = 10_000, debt 5000,
 * interestExpense 250 -> costOfDebt 5%, beta 1.2.
 * Hand-checked: costOfEquity 10.5%, afterTaxCostOfDebt 3.95%, WACC ~8.3167%.
 */
export const WACC_FIXTURE: Financials = {
  ...DCF_FIXTURE,
  ticker: 'WACCTEST',
  price: 10,
  sharesOutstanding: 1000,
  totalDebt: 5000,
  interestExpense: 250,
  beta: 1.2,
};

/**
 * Altman fixture (manufacturing-style). Hand-checked:
 *   Z   = 3.16 (safe),   Z'' = 4.66 (safe).
 *   totalAssets 1000, currentAssets 500, currentLiabilities 300,
 *   retainedEarnings 400, EBIT 200, totalLiabilities 600, revenue 900,
 *   totalEquity 400, marketCap = 10*80 = 800.
 */
export const ALTMAN_FIXTURE: Financials = {
  ...DCF_FIXTURE,
  ticker: 'ALTMAN',
  price: 10,
  sharesOutstanding: 80,
  totalAssets: 1000,
  currentAssets: 500,
  currentLiabilities: 300,
  retainedEarnings: 400,
  operatingIncome: 200,
  totalLiabilities: 600,
  revenue: 900,
  totalEquity: 400,
};

/**
 * Piotroski fixture crafted to score EXACTLY 8/9. The only failing signal is
 * ΔAsset turnover (revenue/totalAssets is 0.9 in both periods -> not improving).
 */
const PIOTROSKI_PRIOR: PeriodFinancials = {
  revenue: 900,
  costOfGoodsSold: 550,
  grossProfit: 350,
  sga: 100,
  operatingIncome: 150,
  depreciationAmortization: 40,
  ebitda: 190,
  netIncome: 80,
  operatingCashFlow: 90,
  freeCashFlow: 70,
  capex: 20,
  interestExpense: 10,
  totalAssets: 1000,
  currentAssets: 400,
  cash: 100,
  receivables: 120,
  inventory: 90,
  ppeNet: 300,
  totalLiabilities: 500,
  currentLiabilities: 300,
  longTermDebt: 150,
  totalDebt: 160,
  totalEquity: 500,
  retainedEarnings: 300,
  sharesOutstanding: 55,
  dividendsPaid: 0,
};

export const PIOTROSKI_FIXTURE: Financials = {
  ...DCF_FIXTURE,
  ticker: 'PIOT',
  netIncome: 100,
  totalAssets: 1000,
  operatingCashFlow: 150,
  currentAssets: 500,
  currentLiabilities: 250,
  grossProfit: 400,
  revenue: 900,
  longTermDebt: 100,
  sharesOutstanding: 50,
  prior: PIOTROSKI_PRIOR,
};

/**
 * Beneish fixture. Hand-checked M ~ -2.4393 (below -1.78 => no manipulation flag).
 */
const BENEISH_PRIOR: PeriodFinancials = {
  revenue: 900,
  costOfGoodsSold: 520,
  grossProfit: 380,
  sga: 95,
  operatingIncome: 150,
  depreciationAmortization: 45,
  ebitda: 195,
  netIncome: 80,
  operatingCashFlow: 100,
  freeCashFlow: 80,
  capex: 20,
  interestExpense: 8,
  totalAssets: 950,
  currentAssets: 450,
  cash: 100,
  receivables: 80,
  inventory: 90,
  ppeNet: 280,
  totalLiabilities: 450,
  currentLiabilities: 180,
  longTermDebt: 140,
  totalDebt: 150,
  totalEquity: 500,
  retainedEarnings: 300,
  sharesOutstanding: 50,
  dividendsPaid: 0,
};

export const BENEISH_FIXTURE: Financials = {
  ...DCF_FIXTURE,
  ticker: 'BENE',
  receivables: 100,
  revenue: 1000,
  grossProfit: 400,
  currentAssets: 500,
  ppeNet: 300,
  totalAssets: 1000,
  depreciationAmortization: 50,
  sga: 100,
  currentLiabilities: 200,
  longTermDebt: 150,
  netIncome: 90,
  operatingCashFlow: 120,
  prior: BENEISH_PRIOR,
};

/**
 * Dividend payer fixture: D0 = 2/share (via dividendPerShare), beta 1.2 so
 * costOfEquity = 10.5%, g = terminalGrowth (2% default) -> value = 24/share.
 */
export const DDM_FIXTURE: Financials = {
  ...DCF_FIXTURE,
  ticker: 'DIVCO',
  beta: 1.2,
  dividendPerShare: 2,
  dividendsPaid: 200,
  sharesOutstanding: 100,
};
