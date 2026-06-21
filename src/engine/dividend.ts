import {
  DdmResult,
  Financials,
  ValuationAssumptions,
  WaccInputs,
} from './types';
import { DEFAULT_ASSUMPTIONS, computeWacc } from './valuation';

/**
 * Gordon-growth Dividend Discount Model (single-stage).
 *
 *   value = D1 / (r - g)         where D1 = D0 * (1 + g)
 *
 *   r = cost of equity (CAPM, from computeWacc — NOT WACC; DDM discounts the
 *       equity cash flow to shareholders at the equity required return).
 *   g = dividend growth. We reuse the forecast `growthRate` assumption as a
 *       proxy for sustainable dividend growth. ASSUMPTION (flagged): a more
 *       precise g would be retention * ROE; we keep it driven by the same
 *       assumptions block the DCF uses so the UI has one lever.
 *
 * Applicability:
 *   - Non-payers (no dividendPerShare and no dividendsPaid > 0) -> not applicable.
 *   - r <= g (model diverges / negative) -> not applicable, with a note.
 *
 * D0 (trailing dividend per share) resolution:
 *   - prefer f.dividendPerShare
 *   - else derive from total dividendsPaid / sharesOutstanding.
 */
export function ddm(
  f: Financials,
  a: ValuationAssumptions = DEFAULT_ASSUMPTIONS,
  waccInputs: Partial<WaccInputs> = {},
): DdmResult {
  const costOfEquity = computeWacc(f, waccInputs).costOfEquity;
  const g = a.terminalGrowth; // perpetual dividend growth = long-run / terminal rate

  // Resolve trailing dividend per share (D0).
  let d0 = f.dividendPerShare ?? 0;
  if (d0 <= 0 && f.dividendsPaid > 0 && f.sharesOutstanding > 0) {
    d0 = f.dividendsPaid / f.sharesOutstanding;
  }

  if (d0 <= 0) {
    return {
      applicable: false,
      valuePerShare: null,
      costOfEquity,
      dividendGrowth: g,
      note: 'non-dividend payer — DDM not applicable',
    };
  }

  if (costOfEquity <= g) {
    return {
      applicable: false,
      valuePerShare: null,
      costOfEquity,
      dividendGrowth: g,
      note: 'cost of equity <= dividend growth — Gordon model diverges',
    };
  }

  const d1 = d0 * (1 + g);
  const valuePerShare = d1 / (costOfEquity - g);

  return {
    applicable: true,
    valuePerShare,
    costOfEquity,
    dividendGrowth: g,
  };
}
