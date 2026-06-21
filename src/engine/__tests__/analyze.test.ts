import { describe, it, expect } from 'vitest';
import {
  analyzeFinancials,
  analyzeTicker,
  getAvailableTickers,
} from '../analyze';
import { MOCK_FINANCIALS } from '../mockData';

describe('analyze pipeline (public API, backward compatible)', () => {
  it('analyzeTicker returns null for unknown tickers', () => {
    expect(analyzeTicker('ZZZZ')).toBeNull();
  });

  it('analyzeTicker is case/whitespace insensitive', () => {
    expect(analyzeTicker('  aapl ')?.financials.ticker).toBe('AAPL');
  });

  it('keeps the legacy Analysis shape (financials/metrics/valuation)', () => {
    const a = analyzeTicker('AAPL')!;
    expect(a.financials).toBeDefined();
    expect(a.metrics.marketCap).toBeGreaterThan(0);
    expect(['Undervalued', 'Fairly valued', 'Overvalued']).toContain(
      a.valuation.verdict,
    );
  });

  it('adds the new engine outputs additively', () => {
    const a = analyzeTicker('AAPL')!;
    expect(a.wacc.wacc).toBeGreaterThan(0);
    expect(a.dcfRange.bear).toBeLessThanOrEqual(a.dcfRange.bull);
    expect(a.reverseDcf).toBeDefined();
    expect(a.scores.altmanZ.model).toBe('Z');
    expect(a.scores.altmanZdd.model).toBe("Z''");
    expect(a.ddm).toBeDefined();
  });

  it('produces real Piotroski/Beneish for every mock (priors present)', () => {
    for (const ticker of getAvailableTickers()) {
      const a = analyzeTicker(ticker)!;
      expect(a.scores.piotroski.incomplete).toBe(false);
      expect(a.scores.piotroski.score).not.toBeNull();
      expect(a.scores.beneishM.incomplete).toBe(false);
      expect(a.scores.beneishM.mScore).not.toBeNull();
    }
  });

  it('is deterministic: same input -> same output', () => {
    const f = MOCK_FINANCIALS.MSFT;
    expect(JSON.stringify(analyzeFinancials(f))).toBe(
      JSON.stringify(analyzeFinancials(f)),
    );
  });

  it('mock data invariants hold (grossProfit, ebitda, fcf)', () => {
    for (const f of Object.values(MOCK_FINANCIALS)) {
      expect(f.grossProfit).toBeCloseTo(f.revenue - f.costOfGoodsSold, 6);
      expect(f.ebitda).toBeCloseTo(
        f.operatingIncome + f.depreciationAmortization,
        6,
      );
      expect(f.freeCashFlow).toBeCloseTo(f.operatingCashFlow - f.capex, 6);
      expect(f.totalDebt).toBeGreaterThanOrEqual(f.longTermDebt);
      // prior present for every mock
      expect(f.prior).toBeDefined();
    }
  });
});
