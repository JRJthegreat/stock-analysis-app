import {
  AltmanResult,
  AltmanZone,
  BeneishResult,
  Financials,
  PeriodFinancials,
  PiotroskiResult,
  PiotroskiSignal,
} from './types';

// ---------------------------------------------------------------------------
// Altman Z-Score (1968, manufacturing).
//
//   Z = 1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 1.0*X5
//     X1 = (currentAssets - currentLiabilities) / totalAssets   (working capital)
//     X2 = retainedEarnings / totalAssets
//     X3 = EBIT / totalAssets
//     X4 = marketCap / totalLiabilities   (market value of equity / book liabilities)
//     X5 = revenue / totalAssets
//
//   Zones: > 2.99 safe, 1.81–2.99 grey, < 1.81 distress.
// ---------------------------------------------------------------------------
export function altmanZ(f: Financials): AltmanResult {
  const marketCap = f.price * f.sharesOutstanding;
  const ta = f.totalAssets;
  const X1 = (f.currentAssets - f.currentLiabilities) / ta;
  const X2 = f.retainedEarnings / ta;
  const X3 = f.operatingIncome / ta;
  const X4 = f.totalLiabilities !== 0 ? marketCap / f.totalLiabilities : 0;
  const X5 = f.revenue / ta;

  const score = 1.2 * X1 + 1.4 * X2 + 3.3 * X3 + 0.6 * X4 + 1.0 * X5;

  let zone: AltmanZone;
  if (score > 2.99) zone = 'safe';
  else if (score >= 1.81) zone = 'grey';
  else zone = 'distress';

  return { score, zone, model: 'Z' };
}

// ---------------------------------------------------------------------------
// Altman Z'' (re-estimated for non-manufacturers / emerging markets).
//
//   Z'' = 6.56*X1 + 3.26*X2 + 6.72*X3 + 1.05*X4
//     X1 = (currentAssets - currentLiabilities) / totalAssets
//     X2 = retainedEarnings / totalAssets
//     X3 = EBIT / totalAssets
//     X4 = totalEquity / totalLiabilities   (BOOK equity, not market) — no X5.
//
//   Zones: > 2.6 safe, 1.1–2.6 grey, < 1.1 distress.
//   This is the right model for the tech names in the mock set (default to surface).
// ---------------------------------------------------------------------------
export function altmanZdd(f: Financials): AltmanResult {
  const ta = f.totalAssets;
  const X1 = (f.currentAssets - f.currentLiabilities) / ta;
  const X2 = f.retainedEarnings / ta;
  const X3 = f.operatingIncome / ta;
  const X4 = f.totalLiabilities !== 0 ? f.totalEquity / f.totalLiabilities : 0;

  const score = 6.56 * X1 + 3.26 * X2 + 6.72 * X3 + 1.05 * X4;

  let zone: AltmanZone;
  if (score > 2.6) zone = 'safe';
  else if (score >= 1.1) zone = 'grey';
  else zone = 'distress';

  return { score, zone, model: "Z''" };
}

// ---------------------------------------------------------------------------
// Piotroski F-Score (0–9). Needs `prior` for the year-over-year signals.
//
// Nine binary tests across profitability, leverage/liquidity, and efficiency:
//   Profitability (4):
//     1. ROA > 0                         (netIncome / totalAssets)
//     2. CFO > 0                         (operatingCashFlow)
//     3. ΔROA > 0                        (ROA_t > ROA_p)
//     4. Accruals: CFO > netIncome       (quality of earnings)
//   Leverage / liquidity / source of funds (3):
//     5. Δ(longTermDebt/totalAssets) < 0 (deleveraging)
//     6. ΔcurrentRatio > 0
//     7. shares_t <= shares_p            (no dilution)
//   Operating efficiency (2):
//     8. ΔgrossMargin > 0
//     9. ΔassetTurnover > 0              (revenue / totalAssets)
//
// When `prior` is missing we can only evaluate the 4 single-period tests
// (1, 2, 4, and... ) — specifically the four that do not need a prior:
//   ROA>0, CFO>0, accruals(CFO>NI). Note test "no dilution" and the deltas all
// need prior. We return score:null, incomplete:true, with the evaluable signals.
// ---------------------------------------------------------------------------
export function piotroski(f: Financials): PiotroskiResult {
  const roa = f.netIncome / f.totalAssets;
  const cfo = f.operatingCashFlow;

  // Single-period signals (computable without prior).
  const singlePeriod: PiotroskiSignal[] = [
    { name: 'ROA > 0', passed: roa > 0 },
    { name: 'CFO > 0', passed: cfo > 0 },
    { name: 'CFO > Net income (accruals)', passed: cfo > f.netIncome },
  ];

  if (!f.prior) {
    return { score: null, incomplete: true, signals: singlePeriod };
  }

  const p = f.prior;
  const roaPrior = p.netIncome / p.totalAssets;
  const currentRatio = f.currentAssets / f.currentLiabilities;
  const currentRatioPrior = p.currentAssets / p.currentLiabilities;
  const grossMargin = f.grossProfit / f.revenue;
  const grossMarginPrior = p.grossProfit / p.revenue;
  const assetTurnover = f.revenue / f.totalAssets;
  const assetTurnoverPrior = p.revenue / p.totalAssets;
  const ltdRatio = f.longTermDebt / f.totalAssets;
  const ltdRatioPrior = p.longTermDebt / p.totalAssets;

  const signals: PiotroskiSignal[] = [
    { name: 'ROA > 0', passed: roa > 0 },
    { name: 'CFO > 0', passed: cfo > 0 },
    { name: 'ΔROA > 0', passed: roa > roaPrior },
    { name: 'CFO > Net income (accruals)', passed: cfo > f.netIncome },
    { name: 'Δ(LT debt / assets) < 0', passed: ltdRatio < ltdRatioPrior },
    { name: 'ΔCurrent ratio > 0', passed: currentRatio > currentRatioPrior },
    { name: 'No dilution (shares ≤ prior)', passed: f.sharesOutstanding <= p.sharesOutstanding },
    { name: 'ΔGross margin > 0', passed: grossMargin > grossMarginPrior },
    { name: 'ΔAsset turnover > 0', passed: assetTurnover > assetTurnoverPrior },
  ];

  const score = signals.reduce((acc, s) => acc + (s.passed ? 1 : 0), 0);
  return { score, incomplete: false, signals };
}

// ---------------------------------------------------------------------------
// Beneish M-Score (8-variable, 1999). Detects likely earnings manipulation.
//
//   M = -4.84 + 0.920*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI
//          + 0.115*DEPI - 0.172*SGAI + 4.679*TATA - 0.327*LVGI
//
//   DSRI = (receivables_t/revenue_t) / (receivables_p/revenue_p)
//   GMI  = grossMargin_p / grossMargin_t
//   AQI  = [1 - (currentAssets_t + ppeNet_t)/totalAssets_t]
//        / [1 - (currentAssets_p + ppeNet_p)/totalAssets_p]
//   SGI  = revenue_t / revenue_p
//   DEPI = depRate_p / depRate_t,  depRate = D&A / (D&A + ppeNet)
//   SGAI = (sga_t/revenue_t) / (sga_p/revenue_p)
//   LVGI = ((currentLiabilities_t + longTermDebt_t)/totalAssets_t)
//        / ((currentLiabilities_p + longTermDebt_p)/totalAssets_p)
//   TATA = (netIncome_t - operatingCashFlow_t) / totalAssets_t
//
//   Threshold: M > -1.78 => possible manipulation. Needs `prior`.
// ---------------------------------------------------------------------------
export function beneishM(f: Financials): BeneishResult {
  if (!f.prior) {
    return {
      mScore: null,
      incomplete: true,
      manipulationFlag: false,
      components: null,
    };
  }
  const t = f;
  const p: PeriodFinancials = f.prior;

  const grossMarginT = t.grossProfit / t.revenue;
  const grossMarginP = p.grossProfit / p.revenue;

  const depRateT = t.depreciationAmortization / (t.depreciationAmortization + t.ppeNet);
  const depRateP = p.depreciationAmortization / (p.depreciationAmortization + p.ppeNet);

  const DSRI = (t.receivables / t.revenue) / (p.receivables / p.revenue);
  const GMI = grossMarginP / grossMarginT;
  const AQI =
    (1 - (t.currentAssets + t.ppeNet) / t.totalAssets) /
    (1 - (p.currentAssets + p.ppeNet) / p.totalAssets);
  const SGI = t.revenue / p.revenue;
  const DEPI = depRateP / depRateT;
  const SGAI = (t.sga / t.revenue) / (p.sga / p.revenue);
  const LVGI =
    ((t.currentLiabilities + t.longTermDebt) / t.totalAssets) /
    ((p.currentLiabilities + p.longTermDebt) / p.totalAssets);
  const TATA = (t.netIncome - t.operatingCashFlow) / t.totalAssets;

  const mScore =
    -4.84 +
    0.92 * DSRI +
    0.528 * GMI +
    0.404 * AQI +
    0.892 * SGI +
    0.115 * DEPI -
    0.172 * SGAI +
    4.679 * TATA -
    0.327 * LVGI;

  return {
    mScore,
    incomplete: false,
    manipulationFlag: mScore > -1.78,
    components: { DSRI, GMI, AQI, SGI, DEPI, SGAI, TATA, LVGI },
  };
}
