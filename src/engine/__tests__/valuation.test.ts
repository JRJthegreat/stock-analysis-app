import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ASSUMPTIONS,
  computeWacc,
  dcfRange,
  runDcf,
} from '../valuation';
import { ValuationAssumptions } from '../types';
import { DCF_FIXTURE, WACC_FIXTURE } from './fixtures';

const A3: ValuationAssumptions = {
  growthRate: 0.1,
  discountRate: 0.1,
  terminalGrowth: 0.02,
  years: 3,
  fadeYears: 0,
};

describe('runDcf (multi-stage FCFF)', () => {
  it('matches a hand-computed 3-year single-stage DCF (14.25/share)', () => {
    // fcf=100 grows 10%/yr for 3yr: 110, 121, 133.1 discounted at 10%.
    // PV(explicit) = 110/1.1 + 121/1.21 + 133.1/1.331 = 100+100+100 = 300.
    // Terminal on cf3=133.1: 133.1*1.02/(0.10-0.02)=135.762/0.08=1697.025
    //   PV terminal = 1697.025/1.331 = 1275. EV=1575, equity=1575-200+50=1425,
    //   /100 shares = 14.25.
    const v = runDcf(DCF_FIXTURE, A3);
    expect(v.intrinsicValuePerShare).toBeCloseTo(14.25, 6);
  });

  it('price set equal to base intrinsic => ~0 upside, Fairly valued', () => {
    const v = runDcf(DCF_FIXTURE, A3); // price fixture is 14.25
    expect(v.upsideVsPrice).toBeCloseTo(0, 6);
    expect(v.verdict).toBe('Fairly valued');
  });

  it('applies the stage-2 linear fade (lower value than no fade)', () => {
    // years=2, fadeYears=2 fading 10% -> 2%. Hand-checked perShare 13.75.
    const faded = runDcf(DCF_FIXTURE, {
      ...A3,
      years: 2,
      fadeYears: 2,
    });
    expect(faded.intrinsicValuePerShare).toBeCloseTo(13.75, 6);
    // fewer high-growth years than pure 3-year 10% growth => lower value
    expect(faded.intrinsicValuePerShare).toBeLessThan(
      runDcf(DCF_FIXTURE, A3).intrinsicValuePerShare,
    );
  });

  it('terminalGrowth >= discountRate is guarded (no blow-up, finite > 0)', () => {
    const v = runDcf(DCF_FIXTURE, {
      growthRate: 0.05,
      discountRate: 0.03,
      terminalGrowth: 0.05, // >= discountRate
      years: 5,
    });
    expect(Number.isFinite(v.intrinsicValuePerShare)).toBe(true);
    expect(v.intrinsicValuePerShare).toBeGreaterThan(0);
  });

  it('verdict thresholds: >+15% Undervalued, <-15% Overvalued', () => {
    const cheap = runDcf({ ...DCF_FIXTURE, price: 10 }, A3); // 14.25 vs 10 => +42%
    expect(cheap.verdict).toBe('Undervalued');
    const rich = runDcf({ ...DCF_FIXTURE, price: 20 }, A3); // 14.25 vs 20 => -29%
    expect(rich.verdict).toBe('Overvalued');
  });
});

describe('dcfRange', () => {
  it('bear < base < bull and base equals runDcf base', () => {
    const r = dcfRange(DCF_FIXTURE, A3);
    expect(r.bear).toBeLessThan(r.base);
    expect(r.base).toBeLessThan(r.bull);
    expect(r.base).toBeCloseTo(runDcf(DCF_FIXTURE, A3).intrinsicValuePerShare, 9);
  });

  it('marginOfSafety = (base - price)/base', () => {
    const r = dcfRange({ ...DCF_FIXTURE, price: 10 }, A3);
    expect(r.marginOfSafety).toBeCloseTo((r.base - 10) / r.base, 9);
  });
});

describe('computeWacc (CAPM)', () => {
  it('matches hand-computed WACC ~8.3167%', () => {
    const w = computeWacc(WACC_FIXTURE);
    expect(w.costOfEquity).toBeCloseTo(0.105, 9); // 0.045 + 1.2*0.05
    expect(w.costOfDebt).toBeCloseTo(0.05, 9); // 250/5000
    expect(w.afterTaxCostOfDebt).toBeCloseTo(0.0395, 9); // 0.05*(1-0.21)
    expect(w.weightEquity).toBeCloseTo(10000 / 15000, 9);
    expect(w.weightDebt).toBeCloseTo(5000 / 15000, 9);
    expect(w.wacc).toBeCloseTo(0.0831667, 6);
  });

  it('beta precedence: explicit input overrides company beta', () => {
    const w = computeWacc(WACC_FIXTURE, { beta: 2 });
    expect(w.costOfEquity).toBeCloseTo(0.045 + 2 * 0.05, 9);
  });

  it('falls back to 5% cost of debt when there is no debt', () => {
    const w = computeWacc({ ...WACC_FIXTURE, totalDebt: 0 });
    expect(w.costOfDebt).toBeCloseTo(0.05, 9);
    expect(w.weightDebt).toBeCloseTo(0, 9);
  });

  it('defaults beta to 1 when company beta is absent', () => {
    const noBeta = { ...WACC_FIXTURE };
    delete (noBeta as { beta?: number }).beta;
    const w = computeWacc(noBeta);
    expect(w.costOfEquity).toBeCloseTo(0.045 + 1 * 0.05, 9);
  });
});
