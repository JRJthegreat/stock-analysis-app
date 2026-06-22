'use client';

import { useEffect, useRef, useState } from 'react';
import { analyzeFinancials, type Analysis } from '../engine';
import {
  fetchFinancials,
  fetchPrices,
  type PricePoint,
} from '../data/fundamentals';
import { fetchPeerComps, type PeerComps } from '../data/comps';
import { AnalysisView } from '../components/AnalysisView';
import { SkeletonScreen } from '../components/Skeleton';
import { SettingsModal } from '../components/SettingsModal';
import type { Thesis } from '../data/thesis';

// Live data supports any ticker; these are just quick-pick chips.
const POPULAR = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META'];
const DEFAULT_TICKER = 'AAPL';

export default function Page() {
  const [input, setInput] = useState(DEFAULT_TICKER);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sparkline + comps are independent side-loads; each owns its own state so a
  // failure in either never blocks the main analysis from rendering.
  const [prices, setPrices] = useState<PricePoint[]>([]);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesFailed, setPricesFailed] = useState(false);

  const [comps, setComps] = useState<PeerComps | null>(null);
  const [compsLoading, setCompsLoading] = useState(false);

  // Monotonic request id: only the latest in-flight lookup may commit state.
  const requestId = useRef(0);

  // --- AI thesis state (lives here so it survives ticker switches) ---------
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Per-ticker thesis cache for the session — switching away and back is free.
  const [theses, setTheses] = useState<Record<string, Thesis>>({});

  const run = async (ticker: string) => {
    const symbol = ticker.trim().toUpperCase();
    if (!symbol) return;

    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    // Reset side panels for the new ticker.
    setPrices([]);
    setPricesFailed(false);
    setPricesLoading(true);
    setComps(null);
    setCompsLoading(false);

    // Price history: fire in parallel; isolated try/catch so it can never throw
    // into the main flow.
    void (async () => {
      try {
        const pts = await fetchPrices(symbol);
        if (id !== requestId.current) return;
        setPrices(pts);
        setPricesFailed(false);
      } catch {
        if (id !== requestId.current) return;
        setPricesFailed(true);
      } finally {
        if (id === requestId.current) setPricesLoading(false);
      }
    })();

    try {
      const f = await fetchFinancials(symbol);
      const result = analyzeFinancials(f);
      if (id !== requestId.current) return; // a newer lookup superseded us
      setAnalysis(result);
      setInput(result.financials.ticker);

      // Comps depend on the analysis metrics; load after we have them, isolated.
      setCompsLoading(true);
      void (async () => {
        try {
          const pc = await fetchPeerComps(result.financials.ticker, result.metrics);
          if (id !== requestId.current) return;
          setComps(pc);
        } catch {
          if (id !== requestId.current) return;
          setComps(null); // treat a comps failure like "no peers" → hide card
        } finally {
          if (id === requestId.current) setCompsLoading(false);
        }
      })();
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof Error ? e.message : `No data for "${symbol}"`);
      setAnalysis(null);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  // Load the default ticker on mount.
  useEffect(() => {
    void run(DEFAULT_TICKER);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-4 pb-16">
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-fg">Stock Analyst</h1>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-xl text-muted"
        >
          ⚙
        </button>
      </div>
      <p className="mb-6 text-sm text-muted">
        Fundamentals + DCF on live market data
      </p>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="Ticker (e.g. AAPL)"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          disabled={loading}
          className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-base text-fg placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-accent px-4 text-[15px] font-bold text-white disabled:opacity-50"
        >
          Analyze
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {POPULAR.map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => void run(t)}
            disabled={loading}
            className="rounded-full border border-border bg-card px-3.5 py-1.5 font-semibold text-muted disabled:opacity-50"
          >
            {t}
          </button>
        ))}
      </div>

      {loading && <SkeletonScreen />}

      {error && !loading && (
        <div className="mt-6">
          <p className="text-[15px] font-semibold text-red">{error}</p>
          <p className="mt-1 text-[13px] text-muted">
            Check the symbol and try again.
          </p>
        </div>
      )}

      {!loading && !error && !analysis && (
        <div className="mt-6">
          <p className="text-sm leading-relaxed text-muted">
            Search a ticker or tap one above to see metrics, a DCF valuation, and
            quality scores.
          </p>
        </div>
      )}

      {analysis && !loading && (
        <AnalysisView
          analysis={analysis}
          prices={prices}
          pricesLoading={pricesLoading}
          pricesFailed={pricesFailed}
          comps={comps}
          compsLoading={compsLoading}
          cachedThesis={theses[analysis.financials.ticker] ?? null}
          onThesisGenerated={(ticker, thesis) =>
            setTheses((prev) => ({ ...prev, [ticker]: thesis }))
          }
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </main>
  );
}
