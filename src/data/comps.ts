// Peer comps composition.
//
// Gathers a peer set (from `fmp-proxy`), computes each peer's metrics with the
// PURE engine, and ranks the target against them via the engine's
// `rankAgainstPeers`. All math stays in `src/engine/`; this file only fetches the
// ingredients and calls the engine. Network-side, so it lives in `src/data/`.

import { computeMetrics, rankAgainstPeers, type Metrics } from '../engine';
import { fetchFinancials, fetchPeers } from './fundamentals';

export interface PeerSnapshot {
  ticker: string;
  name: string;
  metrics: Metrics;
}

export interface PeerComps {
  /** Engine ranking of the target vs the peer set (percentile per multiple). */
  ranks: ReturnType<typeof rankAgainstPeers>;
  /** The peers we successfully fetched, for display. */
  peers: PeerSnapshot[];
}

/**
 * Fetch the target's peers, compute their metrics, and rank the target against
 * them. Returns null when no usable peers are available (caller hides the card).
 * Individual peer fetch failures are tolerated (a thin peer set still ranks).
 */
export async function fetchPeerComps(
  ticker: string,
  targetMetrics: Metrics,
): Promise<PeerComps | null> {
  const symbols = await fetchPeers(ticker);
  if (!symbols.length) return null;

  const settled = await Promise.allSettled(symbols.map((s) => fetchFinancials(s)));
  const peers: PeerSnapshot[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      const f = r.value;
      peers.push({ ticker: f.ticker, name: f.name, metrics: computeMetrics(f) });
    }
  }
  // Need a few real peers for the percentiles to mean anything. SimFin's sector-based
  // peers are noisy (obscure micro-caps that often fail to fetch), so hide the comps card
  // rather than show a misleading "vs 1 peer" read. (Proper peer quality is a follow-up.)
  if (peers.length < 3) return null;

  const ranks = rankAgainstPeers(targetMetrics, peers.map((p) => p.metrics));
  return { ranks, peers };
}
