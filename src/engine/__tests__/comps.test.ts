import { describe, it, expect } from 'vitest';
import { rankAgainstPeers } from '../comps';
import { Metrics } from '../types';

// Minimal Metrics builder — only the four ranked multiples matter here.
function metrics(partial: Partial<Metrics>): Metrics {
  return {
    marketCap: 0,
    enterpriseValue: 0,
    grossMargin: 0,
    operatingMargin: 0,
    netMargin: 0,
    fcfMargin: 0,
    roe: 0,
    netDebt: 0,
    debtToEquity: 0,
    eps: 0,
    pe: 0,
    evToEbit: 0,
    priceToFcf: 0,
    currentRatio: null,
    quickRatio: null,
    interestCoverage: null,
    assetTurnover: null,
    roa: null,
    roic: null,
    evToEbitda: null,
    fcfYield: null,
    dividendYield: null,
    payoutRatio: null,
    ...partial,
  };
}

describe('rankAgainstPeers (cheapness percentile, higher = cheaper)', () => {
  it('cheapest target ranks at the top (1.0)', () => {
    const target = metrics({ pe: 5 });
    const peers = [metrics({ pe: 10 }), metrics({ pe: 20 }), metrics({ pe: 30 })];
    // target cheaper than all 3 peers -> 3/3 = 1.0
    expect(rankAgainstPeers(target, peers).pe).toBeCloseTo(1.0, 9);
  });

  it('most expensive target ranks at the bottom (0.0)', () => {
    const target = metrics({ pe: 40 });
    const peers = [metrics({ pe: 10 }), metrics({ pe: 20 }), metrics({ pe: 30 })];
    expect(rankAgainstPeers(target, peers).pe).toBeCloseTo(0.0, 9);
  });

  it('middle multiple gives a middling percentile with tie credit', () => {
    // target pe=20; peers 10,20,30. cheaperCount(peers>20)=1, ties(=20)=1.
    // (1 + 0.5*1)/3 = 0.5
    const target = metrics({ pe: 20 });
    const peers = [metrics({ pe: 10 }), metrics({ pe: 20 }), metrics({ pe: 30 })];
    expect(rankAgainstPeers(target, peers).pe).toBeCloseTo(0.5, 9);
  });

  it('ranks all four multiples independently', () => {
    const target = metrics({ pe: 10, evToEbit: 8, evToEbitda: 6, priceToFcf: 12 });
    const peers = [
      metrics({ pe: 20, evToEbit: 4, evToEbitda: 12, priceToFcf: 24 }),
      metrics({ pe: 30, evToEbit: 16, evToEbitda: 6, priceToFcf: 6 }),
    ];
    const r = rankAgainstPeers(target, peers);
    expect(r.pe).toBeCloseTo(1.0, 9); // 10 cheaper than 20 and 30
    expect(r.evToEbit).toBeCloseTo(0.5, 9); // cheaper than 16, dearer than 4
    expect(r.evToEbitda).toBeCloseTo(0.75, 9); // <12, tie with 6 -> (1+0.5)/2
    expect(r.priceToFcf).toBeCloseTo(0.5, 9); // <24, >6
  });

  it('returns null when there are no peers or no valid values', () => {
    expect(rankAgainstPeers(metrics({ pe: 10 }), []).pe).toBeNull();
    const r = rankAgainstPeers(metrics({ evToEbitda: null }), [
      metrics({ evToEbitda: 5 }),
    ]);
    expect(r.evToEbitda).toBeNull();
  });
});
