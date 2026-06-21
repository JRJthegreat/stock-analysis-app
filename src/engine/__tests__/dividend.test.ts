import { describe, it, expect } from 'vitest';
import { ddm } from '../dividend';
import { ValuationAssumptions } from '../types';
import { DCF_FIXTURE, DDM_FIXTURE } from './fixtures';

const A: ValuationAssumptions = {
  growthRate: 0.1,
  discountRate: 0.1,
  terminalGrowth: 0.02,
  years: 3,
};

describe('ddm (Gordon growth)', () => {
  it('values a payer at D0*(1+g)/(r-g) = 24/share', () => {
    // D0=2, g=terminalGrowth=0.02, r=costOfEquity=0.045+1.2*0.05=0.105.
    // value = 2*1.02/(0.105-0.02) = 2.04/0.085 = 24.
    const r = ddm(DDM_FIXTURE, A);
    expect(r.applicable).toBe(true);
    expect(r.costOfEquity).toBeCloseTo(0.105, 9);
    expect(r.dividendGrowth).toBeCloseTo(0.02, 9);
    expect(r.valuePerShare as number).toBeCloseTo(24, 6);
  });

  it('derives D0 from dividendsPaid when dividendPerShare is absent', () => {
    const noDps = { ...DDM_FIXTURE };
    delete noDps.dividendPerShare; // dividendsPaid=200, shares=100 -> D0=2
    const r = ddm(noDps, A);
    expect(r.applicable).toBe(true);
    expect(r.valuePerShare as number).toBeCloseTo(24, 6);
  });

  it('is not applicable for a non-payer', () => {
    const r = ddm(DCF_FIXTURE, A); // dividendsPaid 0, no DPS
    expect(r.applicable).toBe(false);
    expect(r.valuePerShare).toBeNull();
    expect(r.note).toBeTruthy();
  });

  it('is not applicable when cost of equity <= dividend growth', () => {
    // Force g high via terminalGrowth above costOfEquity (0.105).
    const r = ddm(DDM_FIXTURE, { ...A, terminalGrowth: 0.2 });
    expect(r.applicable).toBe(false);
    expect(r.valuePerShare).toBeNull();
  });
});
