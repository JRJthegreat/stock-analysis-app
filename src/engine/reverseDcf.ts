import { Financials, ReverseDcfResult, ValuationAssumptions } from './types';
import { DEFAULT_ASSUMPTIONS, dcfPerShareForGrowth } from './valuation';

/**
 * Reverse DCF: solve for the constant FCF growth rate that makes the (single
 * stage) DCF intrinsic value equal the current market price. Lets the UI say
 * "at $X the price implies ~Y% FCF growth for the next N years".
 *
 * Method: bisection. The model is monotincreasing in growth (higher growth ->
 * higher value, all else equal), so a sign change between two growth bounds
 * brackets exactly one root. We search g in [LOW, HIGH].
 *
 * Edge cases handled:
 *   - price <= 0 or no shares: unsolvable, returns solved:false.
 *   - price below value at the lowest growth: implies the market expects DECLINE
 *     beyond our LOW bound -> report LOW with a note (no solution in range).
 *   - price above value at the highest growth: implies heroic growth beyond our
 *     HIGH bound -> report HIGH with a note.
 */
export function reverseDcf(
  f: Financials,
  a: ValuationAssumptions = DEFAULT_ASSUMPTIONS,
): ReverseDcfResult {
  const LOW = -0.5; // -50% annual FCF growth (severe decline)
  const HIGH = 1.0; // +100% annual FCF growth (hyper growth)
  const TOL = 1e-4; // price tolerance in $/share-ish units (value space)
  const MAX_ITER = 200;

  if (!Number.isFinite(f.price) || f.price <= 0 || f.sharesOutstanding <= 0) {
    return { impliedGrowth: null, solved: false, note: 'invalid price or shares' };
  }

  const valueAt = (g: number) => dcfPerShareForGrowth(f, a, g) - f.price;

  let fLow = valueAt(LOW);
  let fHigh = valueAt(HIGH);

  // value() is increasing in g, so fLow < 0 < fHigh when the root is in range.
  if (fLow > 0) {
    // Even at -50% growth the model values the company above the price: the
    // market implies even steeper decline than we bracket.
    return {
      impliedGrowth: LOW,
      solved: false,
      note: 'price below intrinsic value even at -50% growth; implied growth < -50%',
    };
  }
  if (fHigh < 0) {
    // Even at +100% growth value stays below price: market implies > 100% growth.
    return {
      impliedGrowth: HIGH,
      solved: false,
      note: 'price above intrinsic value even at +100% growth; implied growth > 100%',
    };
  }

  let lo = LOW;
  let hi = HIGH;
  let mid = (lo + hi) / 2;

  for (let i = 0; i < MAX_ITER; i++) {
    mid = (lo + hi) / 2;
    const fMid = valueAt(mid);
    if (Math.abs(fMid) < TOL) {
      return { impliedGrowth: mid, solved: true };
    }
    // Keep the half-interval that still brackets the sign change.
    if ((fLow < 0 && fMid < 0) || (fLow > 0 && fMid > 0)) {
      lo = mid;
      fLow = fMid;
    } else {
      hi = mid;
      fHigh = fMid;
    }
  }

  // Converged on interval width but not tolerance — return midpoint as best estimate.
  return { impliedGrowth: mid, solved: true };
}
