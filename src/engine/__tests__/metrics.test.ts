import { describe, it, expect } from 'vitest';
import { computeMetrics } from '../metrics';
import { DCF_FIXTURE } from './fixtures';

describe('computeMetrics', () => {
  it('computes legacy and new ratios from the DCF fixture', () => {
    const m = computeMetrics(DCF_FIXTURE);
    // marketCap = 14.25 * 100 = 1425
    expect(m.marketCap).toBeCloseTo(1425, 6);
    // netDebt = 200 - 50 = 150 ; EV = 1425 + 150 = 1575
    expect(m.netDebt).toBeCloseTo(150, 6);
    expect(m.enterpriseValue).toBeCloseTo(1575, 6);
    // grossMargin = 400/1000 = 0.4
    expect(m.grossMargin).toBeCloseTo(0.4, 9);
    // currentRatio = 800/400 = 2
    expect(m.currentRatio).toBeCloseTo(2, 9);
    // quickRatio = (800-150)/400 = 1.625
    expect(m.quickRatio).toBeCloseTo(1.625, 9);
    // interestCoverage = EBIT/interest = 200/10 = 20
    expect(m.interestCoverage).toBeCloseTo(20, 9);
    // assetTurnover = 1000/2000 = 0.5
    expect(m.assetTurnover).toBeCloseTo(0.5, 9);
    // roa = 120/2000 = 0.06
    expect(m.roa).toBeCloseTo(0.06, 9);
    // evToEbitda = 1575/250 = 6.3
    expect(m.evToEbitda).toBeCloseTo(6.3, 9);
    // fcfYield = 100/1425
    expect(m.fcfYield).toBeCloseTo(100 / 1425, 9);
    // roic = NOPAT/investedCapital = 200*0.79 / (200+1100-50) = 158/1250 = 0.1264
    expect(m.roic).toBeCloseTo(158 / 1250, 9);
  });

  it('returns null for new ratios on divide-by-zero', () => {
    const z = computeMetrics({
      ...DCF_FIXTURE,
      currentLiabilities: 0,
      totalAssets: 0,
      ebitda: 0,
      interestExpense: 0,
    });
    expect(z.currentRatio).toBeNull();
    expect(z.quickRatio).toBeNull();
    expect(z.assetTurnover).toBeNull();
    expect(z.roa).toBeNull();
    expect(z.evToEbitda).toBeNull();
    expect(z.interestCoverage).toBeNull();
  });

  it('legacy fields stay numeric (0 fallback) to preserve UI types', () => {
    const z = computeMetrics({
      ...DCF_FIXTURE,
      revenue: 0,
      totalEquity: 0,
      netIncome: 0,
      operatingIncome: 0,
      freeCashFlow: 0,
    });
    // eps = 0/shares = 0; pe = price/0 -> guarded to 0 (number, not Infinity)
    expect(z.eps).toBe(0);
    expect(z.pe).toBe(0);
    expect(z.grossMargin).toBe(0);
    expect(Number.isFinite(z.pe)).toBe(true);
  });

  it('dividendYield is null for non-payers, populated for payers', () => {
    expect(computeMetrics(DCF_FIXTURE).dividendYield).toBeNull();
    const payer = computeMetrics({ ...DCF_FIXTURE, dividendPerShare: 1, price: 50 });
    expect(payer.dividendYield).toBeCloseTo(0.02, 9);
  });
});
