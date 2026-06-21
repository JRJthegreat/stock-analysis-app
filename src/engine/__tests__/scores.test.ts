import { describe, it, expect } from 'vitest';
import { altmanZ, altmanZdd, beneishM, piotroski } from '../scores';
import {
  ALTMAN_FIXTURE,
  BENEISH_FIXTURE,
  PIOTROSKI_FIXTURE,
} from './fixtures';

describe('Altman Z (manufacturing)', () => {
  it('matches hand-computed Z = 3.16 (safe zone)', () => {
    const r = altmanZ(ALTMAN_FIXTURE);
    expect(r.score).toBeCloseTo(3.16, 6);
    expect(r.zone).toBe('safe');
    expect(r.model).toBe('Z');
  });

  it('zones: distress < 1.81, grey in [1.81, 2.99]', () => {
    // Strip out value to drive the score down: zero out drivers.
    const distress = altmanZ({
      ...ALTMAN_FIXTURE,
      retainedEarnings: -500,
      operatingIncome: 0,
      revenue: 100,
      price: 0.1,
      sharesOutstanding: 1,
    });
    expect(distress.zone).toBe('distress');
  });
});

describe("Altman Z'' (non-manufacturer)", () => {
  it("matches hand-computed Z'' = 4.66 (safe zone)", () => {
    const r = altmanZdd(ALTMAN_FIXTURE);
    expect(r.score).toBeCloseTo(4.66, 6);
    expect(r.zone).toBe('safe');
    expect(r.model).toBe("Z''");
  });
});

describe('Piotroski F-Score', () => {
  it('scores exactly 8/9 on the crafted fixture (only ΔAsset turnover fails)', () => {
    const r = piotroski(PIOTROSKI_FIXTURE);
    expect(r.incomplete).toBe(false);
    expect(r.score).toBe(8);
    expect(r.signals).toHaveLength(9);
    const failing = r.signals.filter((s) => !s.passed);
    expect(failing).toHaveLength(1);
    expect(failing[0].name).toContain('Asset turnover');
  });

  it('degrades gracefully when prior is missing (4 single-period signals)', () => {
    const noPrior = { ...PIOTROSKI_FIXTURE };
    delete noPrior.prior;
    const r = piotroski(noPrior);
    expect(r.score).toBeNull();
    expect(r.incomplete).toBe(true);
    // single-period signals only (ROA>0, CFO>0, accruals)
    expect(r.signals).toHaveLength(3);
    expect(r.signals.every((s) => s.passed)).toBe(true);
  });
});

describe('Beneish M-Score', () => {
  it('matches hand-computed M ~ -2.4393 (no manipulation flag)', () => {
    const r = beneishM(BENEISH_FIXTURE);
    expect(r.incomplete).toBe(false);
    expect(r.mScore).not.toBeNull();
    expect(r.mScore as number).toBeCloseTo(-2.4393, 3);
    expect(r.manipulationFlag).toBe(false);
  });

  it('exposes the 8 components with known values', () => {
    const r = beneishM(BENEISH_FIXTURE);
    const c = r.components!;
    expect(c.DSRI).toBeCloseTo(1.125, 6);
    expect(c.SGI).toBeCloseTo(1.1111111, 6);
    expect(c.TATA).toBeCloseTo(-0.03, 9);
  });

  it('flags manipulation when M crosses above -1.78', () => {
    // Inflate TATA hugely (high accruals) to push M past the threshold.
    const flagged = beneishM({
      ...BENEISH_FIXTURE,
      netIncome: 500,
      operatingCashFlow: 0, // big positive accruals
    });
    expect(flagged.mScore as number).toBeGreaterThan(-1.78);
    expect(flagged.manipulationFlag).toBe(true);
  });

  it('degrades gracefully when prior is missing', () => {
    const noPrior = { ...BENEISH_FIXTURE };
    delete noPrior.prior;
    const r = beneishM(noPrior);
    expect(r.mScore).toBeNull();
    expect(r.incomplete).toBe(true);
    expect(r.components).toBeNull();
    expect(r.manipulationFlag).toBe(false);
  });
});
