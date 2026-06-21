import { CompsResult, Metrics } from './types';

/**
 * Percentile rank of `value` within `population` (inclusive of the target).
 *
 * Definition used: fraction of peers (excluding the target itself) that the
 * target is "cheaper than", i.e. has a LOWER multiple than. We add 0.5 credit
 * for ties so the rank is symmetric. Result in [0, 1]:
 *   - 0.0  => target has the highest (most expensive) multiple in the set
 *   - 1.0  => target has the lowest (cheapest) multiple in the set
 *
 * For valuation multiples LOWER = CHEAPER, so a HIGH percentile here means the
 * target screens cheap relative to peers. We document this orientation so the
 * UI/AI layer reads it correctly.
 *
 * Returns null when there are no valid peers, or the target value is null.
 */
function cheapnessPercentile(
  value: number | null,
  peers: Array<number | null>,
): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const valid = peers.filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  if (valid.length === 0) return null;

  let cheaperCount = 0; // peers MORE expensive than target (target cheaper than them)
  let ties = 0;
  for (const peer of valid) {
    if (value < peer) cheaperCount++;
    else if (value === peer) ties++;
  }
  return (cheaperCount + 0.5 * ties) / valid.length;
}

/**
 * Rank a target's valuation multiples against a peer set.
 *
 * Pure: callers fetch peers and compute their Metrics; this does NO fetching.
 * Each field is the target's cheapness percentile (0..1, higher = cheaper) for
 * that multiple, or null when not computable.
 *
 * Multiples ranked: pe, evToEbit, evToEbitda, priceToFcf. (evToEbitda is the
 * `number | null` upgrade field; the others are legacy `number`.)
 */
export function rankAgainstPeers(
  target: Metrics,
  peers: Metrics[],
): CompsResult {
  return {
    pe: cheapnessPercentile(
      target.pe,
      peers.map((p) => p.pe),
    ),
    evToEbit: cheapnessPercentile(
      target.evToEbit,
      peers.map((p) => p.evToEbit),
    ),
    evToEbitda: cheapnessPercentile(
      target.evToEbitda,
      peers.map((p) => p.evToEbitda),
    ),
    priceToFcf: cheapnessPercentile(
      target.priceToFcf,
      peers.map((p) => p.priceToFcf),
    ),
  };
}
