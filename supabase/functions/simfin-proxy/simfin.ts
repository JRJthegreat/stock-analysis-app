// SimFin (backend.simfin.com/api/v3) → engine `Financials` mapping
// (mirrors src/engine/types.ts and the FMP mapper in ../fmp-proxy/fmp.ts).
//
// Verified against live SimFin AAPL FY2025 (Jun 2026). SimFin returns "compact"
// statements as { columns: [...names], data: [[...row], ...] } so we look up
// values by COLUMN NAME (column order is not guaranteed). Monetary values come
// back in absolute USD → the engine wants USD **millions**, so we divide by 1e6.
// SimFin signs expenses/outflows NEGATIVE → we take abs() for cost of revenue,
// SG&A, interest expense, capex and dividends to match the positive magnitudes
// the engine assumes.
//
// Auth: header `Authorization: <SIMFIN_API_KEY>` — the RAW key, NO "Bearer"
// prefix (SimFin v3 quirk).
//
// LICENSING / RATE LIMITS: SimFin's free/standard tiers rate-limit hard and
// forbid bulk redistribution of raw data. We cache per-ticker upstream of this
// file (see index.ts) so smoke tests / repeated views don't burn the quota.
// TODO(security): the SIMFIN_API_KEY lives server-side here (good); keep it out
// of the mobile client.

const SIMFIN = "https://backend.simfin.com/api/v3";
const MILLION = 1e6;

type Json = Record<string, any>;

/** A column-name → value lookup over one SimFin compact statement row. */
type Row = (name: string) => number | null;

const mil = (n: number | null | undefined) => (n == null ? 0 : n / MILLION);
const pos = (n: number | null | undefined) => Math.abs(n ?? 0) / MILLION; // magnitude, in millions

// --- HTTP -----------------------------------------------------------------

async function simfinGet(path: string, key: string): Promise<any> {
  const res = await fetch(`${SIMFIN}${path}`, {
    headers: { Authorization: key, accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SimFin ${path} -> HTTP ${res.status} ${body.slice(0, 160)}`);
  }
  return res.json();
}

// --- compact-statement helpers -------------------------------------------

/** Build a (columnName) -> value reader for a single data row. */
function rowReader(columns: string[], data: any[]): Row {
  const index = new Map<string, number>();
  columns.forEach((c, i) => index.set(c, i));
  return (name: string) => {
    const i = index.get(name);
    if (i == null) return null;
    const v = data[i];
    return typeof v === "number" ? v : v == null ? null : Number(v);
  };
}

/**
 * From a `statements/compact` company entry, return readers for the latest two
 * fiscal years of one statement (PL | BS | CF), keyed by the "Fiscal Year"
 * value so the three statements can be aligned to the same year.
 *
 * Returns Map<fiscalYear, Row> plus the descending list of fiscal years.
 */
function statementByYear(company: Json, statement: "PL" | "BS" | "CF") {
  const st = (company.statements ?? []).find((s: Json) => s.statement === statement);
  const out = new Map<number, Row>();
  const years: number[] = [];
  if (!st || !Array.isArray(st.columns) || !Array.isArray(st.data)) return { out, years };
  const fyIdx = st.columns.indexOf("Fiscal Year");
  for (const data of st.data) {
    const fy = fyIdx >= 0 ? Number(data[fyIdx]) : NaN;
    if (!Number.isFinite(fy)) continue;
    out.set(fy, rowReader(st.columns, data));
    years.push(fy);
  }
  // SimFin returns oldest→newest; sort descending so years[0] is the latest.
  years.sort((a, b) => b - a);
  return { out, years };
}

/** One fiscal year, normalized into the engine's PeriodFinancials shape. */
function period(pl: Row, bs: Row, cf: Row, sharesOutstanding: number) {
  const operatingIncome = mil(pl("Operating Income (Loss)"));
  const depreciationAmortization = mil(cf("Depreciation & Amortization"));
  const operatingCashFlow = mil(cf("Cash from Operating Activities"));
  const capex = pos(cf("Change in Fixed Assets & Intangibles"));

  return {
    revenue: mil(pl("Revenue")),
    costOfGoodsSold: pos(pl("Cost of revenue")),
    grossProfit: mil(pl("Gross Profit")),
    sga: pos(pl("Selling, General & Administrative")),
    operatingIncome,
    depreciationAmortization,
    ebitda: operatingIncome + depreciationAmortization,
    netIncome: mil(pl("Net Income")),
    operatingCashFlow,
    freeCashFlow: operatingCashFlow - capex,
    capex,
    interestExpense: pos(pl("Interest Expense")), // null → 0
    totalAssets: mil(bs("Total Assets")),
    currentAssets: mil(bs("Total Current Assets")),
    cash: mil(bs("Cash & Cash Equivalents")),
    receivables: mil(bs("Accounts & Notes Receivable")),
    inventory: mil(bs("Inventories")),
    ppeNet: mil(bs("Property, Plant & Equipment, Net")),
    totalLiabilities: mil(bs("Total Liabilities")),
    currentLiabilities: mil(bs("Total Current Liabilities")),
    longTermDebt: pos(bs("Long Term Debt")),
    totalDebt: pos(bs("Short Term Debt")) + pos(bs("Long Term Debt")),
    totalEquity: mil(bs("Total Equity")),
    retainedEarnings: mil(bs("Retained Earnings")), // can be negative — keep sign
    sharesOutstanding,
    dividendsPaid: pos(cf("Dividends Paid")),
  };
}

// --- prices ---------------------------------------------------------------

type CompactPrices = { columns: string[]; data: any[][] };

/** Latest prices row → { sharesOutstanding (millions), lastClose ($/share) }. */
function latestPriceFacts(prices: CompactPrices | undefined) {
  const empty = { sharesOutstanding: 0, lastClose: 0 };
  if (!prices || !Array.isArray(prices.columns) || !Array.isArray(prices.data) || !prices.data.length) {
    return empty;
  }
  const sharesIdx = prices.columns.indexOf("Common Shares Outstanding");
  const closeIdx = prices.columns.indexOf("Last Closing Price");
  // data is oldest→newest; walk from the end for the most recent non-null values.
  let shares: number | null = null;
  let close: number | null = null;
  for (let i = prices.data.length - 1; i >= 0 && (shares == null || close == null); i--) {
    const row = prices.data[i];
    if (shares == null && sharesIdx >= 0 && row[sharesIdx] != null) shares = Number(row[sharesIdx]);
    if (close == null && closeIdx >= 0 && row[closeIdx] != null) close = Number(row[closeIdx]);
  }
  return {
    sharesOutstanding: shares == null ? 0 : shares / MILLION, // absolute count → millions
    lastClose: close == null ? 0 : close, // per-share USD — NOT divided
  };
}

// --- public API -----------------------------------------------------------

/** Fetch statements (PL,BS,CF, FY) + prices, assemble the engine's `Financials`. */
export async function fetchFinancials(ticker: string, key: string) {
  const sym = ticker.toUpperCase();
  const [stmtsRes, pricesRes] = await Promise.all([
    simfinGet(`/companies/statements/compact?ticker=${encodeURIComponent(sym)}&statements=PL,BS,CF&period=FY`, key),
    simfinGet(`/companies/prices/compact?ticker=${encodeURIComponent(sym)}`, key),
  ]);

  const company: Json | undefined = Array.isArray(stmtsRes) ? stmtsRes[0] : undefined;
  if (!company || !Array.isArray(company.statements)) throw new Error(`No fundamentals for ${sym}`);

  const pl = statementByYear(company, "PL");
  const bs = statementByYear(company, "BS");
  const cf = statementByYear(company, "CF");

  // Align the three statements by "Fiscal Year". Use the years present in ALL
  // three (intersection), latest two descending: [current, prior?].
  const common = pl.years
    .filter((y) => bs.out.has(y) && cf.out.has(y))
    .sort((a, b) => b - a);
  if (!common.length) throw new Error(`No fundamentals for ${sym}`);

  const prices: CompactPrices | undefined = Array.isArray(pricesRes) ? pricesRes[0] : undefined;
  const { sharesOutstanding, lastClose } = latestPriceFacts(prices);

  const curFY = common[0];
  const cur = period(pl.out.get(curFY)!, bs.out.get(curFY)!, cf.out.get(curFY)!, sharesOutstanding);

  // `prior` powers Piotroski / Beneish; omit gracefully if only one year exists.
  // SimFin prices are point-in-time, so we reuse the same share count on both
  // periods (acceptable per the data-layer spec — keeps it simple).
  const priorFY = common[1];
  const prior =
    priorFY != null
      ? period(pl.out.get(priorFY)!, bs.out.get(priorFY)!, cf.out.get(priorFY)!, sharesOutstanding)
      : undefined;

  const revenueGrowth = prior && prior.revenue ? cur.revenue / prior.revenue - 1 : 0;

  return {
    ticker: sym,
    name: (company.name as string) ?? sym,
    price: lastClose, // per-share USD — NOT divided by 1e6
    beta: 1, // SimFin has no beta → engine default
    dividendPerShare: cur.sharesOutstanding ? cur.dividendsPaid / cur.sharesOutstanding : 0,
    revenueGrowth,
    ...cur,
    prior,
  };
}

/** EOD close series (~last 180 days), oldest→newest, for the sparkline. */
export async function fetchPrices(ticker: string, key: string): Promise<{ date: string; price: number }[]> {
  const sym = ticker.toUpperCase();
  const res = await simfinGet(`/companies/prices/compact?ticker=${encodeURIComponent(sym)}`, key);
  const prices: CompactPrices | undefined = Array.isArray(res) ? res[0] : undefined;
  if (!prices || !Array.isArray(prices.columns) || !Array.isArray(prices.data)) {
    throw new Error(`No prices for ${sym}`);
  }
  const dateIdx = prices.columns.indexOf("Date");
  const closeIdx = prices.columns.indexOf("Last Closing Price");
  if (dateIdx < 0 || closeIdx < 0) throw new Error(`No prices for ${sym}`);

  // SimFin returns oldest→newest already; keep that order, take the last ~180.
  return prices.data
    .filter((row) => row[dateIdx] != null && row[closeIdx] != null)
    .slice(-180)
    .map((row) => ({ date: String(row[dateIdx]), price: Number(row[closeIdx]) }));
}

// --- peers ----------------------------------------------------------------

type CompanyListRow = {
  id: number;
  name: string;
  ticker: string;
  sectorCode: number | null;
  industryName: string | null;
  sectorName: string | null;
  isin: string | null;
};

/** The cached `/companies/list` (huge, ~static) — fetched once and reused. */
export async function fetchCompanyList(key: string): Promise<CompanyListRow[]> {
  const res = await simfinGet(`/companies/list`, key);
  if (!Array.isArray(res)) throw new Error("SimFin company list malformed");
  return res as CompanyListRow[];
}

/** The target's sectorCode, via the general endpoint. null when unavailable. */
async function fetchSectorCode(ticker: string, key: string): Promise<number | null> {
  const sym = ticker.toUpperCase();
  const res = await simfinGet(`/companies/general/compact?ticker=${encodeURIComponent(sym)}`, key);
  // general/compact → { columns:[...], data:[[...]] } (single row)
  const columns: string[] | undefined = res?.columns;
  const row: any[] | undefined = Array.isArray(res?.data) ? res.data[0] : undefined;
  if (!Array.isArray(columns) || !Array.isArray(row)) return null;
  const idx = columns.indexOf("sectorCode");
  if (idx < 0 || row[idx] == null) return null;
  const code = Number(row[idx]);
  return Number.isFinite(code) ? code : null;
}

/**
 * Best-effort peers: same sectorCode as the target, up to 6 tickers.
 * SimFin has no peers endpoint, so we filter the (cached) company list.
 * `companyList` is passed in from index.ts so it can be cached in the table.
 * Any failure returns [] — the comps card hides itself gracefully.
 */
export async function fetchPeers(
  ticker: string,
  key: string,
  companyList: CompanyListRow[],
): Promise<string[]> {
  const self = ticker.toUpperCase();
  const sectorCode = await fetchSectorCode(self, key).catch(() => null);
  if (sectorCode == null) return [];

  const sameSector = companyList.filter(
    (c) => c.sectorCode === sectorCode && c.ticker && c.ticker.toUpperCase() !== self,
  );

  // Prefer fully-identified, listed companies (non-null sectorName + isin) so we
  // surface real, comparable peers rather than shells/delisted rows.
  const ranked = [...sameSector].sort((a, b) => {
    const score = (c: CompanyListRow) => (c.sectorName ? 1 : 0) + (c.isin ? 1 : 0);
    return score(b) - score(a);
  });

  const seen = new Set<string>();
  const peers: string[] = [];
  for (const c of ranked) {
    const t = c.ticker.toUpperCase();
    if (seen.has(t)) continue;
    seen.add(t);
    peers.push(t);
    if (peers.length >= 6) break;
  }
  return peers;
}
