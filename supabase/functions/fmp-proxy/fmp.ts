// FMP (/stable API) → engine `Financials` mapping (mirrors src/engine/types.ts).
//
// Verified against live /stable responses (Jun 2026). FMP retired the legacy
// /api/v3 endpoints on 2025-08-31; the current API is /stable with the symbol as
// a query param (?symbol=AAPL). Monetary values come back in absolute USD → the
// engine wants USD **millions**, so we divide by 1e6. FMP signs vary (capex,
// dividends come back negative) → we normalize to the positive magnitudes the
// engine assumes.
//
// Also exports fetchPrices() (EOD close series for the sparkline) and fetchPeers()
// (peer symbols for the comps card).

const FMP = "https://financialmodelingprep.com/stable";
const MILLION = 1e6;

const mil = (n: number | null | undefined) => (n == null ? 0 : n / MILLION);
const pos = (n: number | null | undefined) => Math.abs(n ?? 0) / MILLION; // magnitude, in millions

type Json = Record<string, any>;

async function fmpGet(endpoint: string, ticker: string, key: string, extra = ""): Promise<Json[]> {
  const url = `${FMP}/${endpoint}?symbol=${encodeURIComponent(ticker)}${extra}&apikey=${key}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`FMP ${endpoint} -> HTTP ${res.status} ${body.slice(0, 160)}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    // FMP returns { "Error Message": "..." } on a bad key / unknown symbol.
    throw new Error(`FMP ${endpoint} -> ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data;
}

/** One fiscal year, normalized into the engine's PeriodFinancials shape. */
function period(inc: Json, bal: Json, cf: Json) {
  const operatingCashFlow = mil(cf.operatingCashFlow ?? cf.netCashProvidedByOperatingActivities);
  const capex = pos(cf.capitalExpenditure ?? cf.investmentsInPropertyPlantAndEquipment);
  // Some issuers (e.g. AAPL) report income-statement interestExpense as 0 (netted);
  // fall back to the cash-flow interestPaid so WACC's cost of debt isn't understated.
  const interestExpense = pos(inc.interestExpense) || pos(cf.interestPaid);

  return {
    revenue: mil(inc.revenue),
    costOfGoodsSold: mil(inc.costOfRevenue),
    grossProfit: mil(inc.grossProfit),
    sga: mil(inc.sellingGeneralAndAdministrativeExpenses),
    operatingIncome: mil(inc.operatingIncome),
    depreciationAmortization: mil(inc.depreciationAndAmortization),
    ebitda: mil(inc.ebitda ?? inc.operatingIncome + inc.depreciationAndAmortization),
    netIncome: mil(inc.netIncome),
    operatingCashFlow,
    freeCashFlow: operatingCashFlow - capex, // derive; don't trust FMP's freeCashFlow field
    capex,
    interestExpense,
    totalAssets: mil(bal.totalAssets),
    currentAssets: mil(bal.totalCurrentAssets),
    cash: mil(bal.cashAndCashEquivalents),
    receivables: mil(bal.netReceivables),
    inventory: mil(bal.inventory),
    ppeNet: mil(bal.propertyPlantEquipmentNet),
    totalLiabilities: mil(bal.totalLiabilities),
    currentLiabilities: mil(bal.totalCurrentLiabilities),
    longTermDebt: mil(bal.longTermDebt),
    totalDebt: mil(bal.totalDebt ?? (bal.shortTermDebt ?? 0) + (bal.longTermDebt ?? 0)),
    totalEquity: mil(bal.totalStockholdersEquity ?? bal.totalEquity),
    retainedEarnings: mil(bal.retainedEarnings), // can be negative (heavy buybacks) — leave as-is
    // Shares are a count; mil() puts them in "millions of shares" to match the engine.
    sharesOutstanding: mil(inc.weightedAverageShsOut),
    dividendsPaid: pos(cf.netDividendsPaid ?? cf.commonDividendsPaid),
  };
}

/** Fetch 2 annual years + profile, assemble the engine's `Financials` (with prior). */
export async function fetchFinancials(ticker: string, key: string) {
  const sym = ticker.toUpperCase();
  const annual = "&period=annual&limit=2";
  const [inc, bal, cf, prof] = await Promise.all([
    fmpGet("income-statement", sym, key, annual),
    fmpGet("balance-sheet-statement", sym, key, annual),
    fmpGet("cash-flow-statement", sym, key, annual),
    fmpGet("profile", sym, key),
  ]);
  if (!inc[0] || !bal[0] || !cf[0]) throw new Error(`No fundamentals for ${sym}`);

  const cur = period(inc[0], bal[0], cf[0]);
  // `prior` powers Piotroski / Beneish; omit gracefully if FMP only returned 1 year.
  const prior = inc[1] && bal[1] && cf[1] ? period(inc[1], bal[1], cf[1]) : undefined;
  const profile = prof[0] ?? {};

  const revenueGrowth = prior && prior.revenue ? cur.revenue / prior.revenue - 1 : 0;

  return {
    ticker: sym,
    name: profile.companyName ?? sym,
    price: profile.price ?? 0, // per-share USD — NOT divided by 1e6
    beta: profile.beta ?? 1,
    dividendPerShare:
      profile.lastDividend ?? (cur.sharesOutstanding ? cur.dividendsPaid / cur.sharesOutstanding : 0),
    revenueGrowth,
    ...cur,
    prior,
  };
}

/** EOD close series (~last 180 days), oldest→newest, for the sparkline. */
export async function fetchPrices(ticker: string, key: string): Promise<{ date: string; price: number }[]> {
  const from = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
  const data = await fmpGet("historical-price-eod/light", ticker, key, `&from=${from}`);
  // FMP returns newest-first; cap at 200 then flip to oldest-first.
  return data.slice(0, 200).map((d) => ({ date: d.date, price: d.price })).reverse();
}

/** Up to 6 peer symbols (excluding self) for the comps card. */
export async function fetchPeers(ticker: string, key: string): Promise<string[]> {
  const self = ticker.toUpperCase();
  const data = await fmpGet("stock-peers", self, key);
  return data
    .map((d) => d.symbol as string)
    .filter((s) => s && s.toUpperCase() !== self)
    .slice(0, 6);
}
