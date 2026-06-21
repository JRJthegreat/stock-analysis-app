import { describe, it, expect } from 'vitest';
import { reverseDcf } from '../reverseDcf';
import { runDcf } from '../valuation';
import { ValuationAssumptions } from '../types';
import { DCF_FIXTURE } from './fixtures';

const A: ValuationAssumptions = {
  growthRate: 0.1,
  discountRate: 0.1,
  terminalGrowth: 0.02,
  years: 3,
  fadeYears: 0,
};

describe('reverseDcf', () => {
  it('round-trips: implied growth fed back into DCF reproduces the price', () => {
    // Pick a price that corresponds to some growth in range. Use price=14.25
    // which we know corresponds to ~10% growth.
    const r = reverseDcf({ ...DCF_FIXTURE, price: 14.25 }, A);
    expect(r.solved).toBe(true);
    expect(r.impliedGrowth).not.toBeNull();
    expect(r.impliedGrowth as number).toBeCloseTo(0.1, 3);

    // Round-trip: DCF at the implied growth equals the price.
    const back = runDcf({ ...DCF_FIXTURE, price: 14.25 }, {
      ...A,
      growthRate: r.impliedGrowth as number,
    });
    expect(back.intrinsicValuePerShare).toBeCloseTo(14.25, 2);
  });

  it('solves a different price to a different (higher) growth', () => {
    const r = reverseDcf({ ...DCF_FIXTURE, price: 20 }, A);
    expect(r.solved).toBe(true);
    expect(r.impliedGrowth as number).toBeGreaterThan(0.1);
  });

  it('returns unsolved with a note when price exceeds value at +100% growth', () => {
    const r = reverseDcf({ ...DCF_FIXTURE, price: 1e9 }, A);
    expect(r.solved).toBe(false);
    expect(r.impliedGrowth).toBe(1.0);
    expect(r.note).toBeTruthy();
  });

  it('handles invalid price gracefully', () => {
    const r = reverseDcf({ ...DCF_FIXTURE, price: 0 }, A);
    expect(r.solved).toBe(false);
    expect(r.impliedGrowth).toBeNull();
  });
});
