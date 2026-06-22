'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Analysis,
  AltmanResult,
  BeneishResult,
  CompsResult,
  DcfRange,
  DEFAULT_ASSUMPTIONS,
  dcfRange as computeDcfRange,
  Metrics,
  PiotroskiResult,
  runDcf,
  ValuationAssumptions,
} from '../engine';
import type { PricePoint } from '../data/fundamentals';
import type { PeerComps } from '../data/comps';
import { getAnthropicKey } from '../data/secureStore';
import { generateThesis, type Thesis } from '../data/thesis';
import { Stat } from './Stat';
import { VerdictPill } from './VerdictPill';
import { Slider } from './Slider';
import { Sparkline } from './Sparkline';
import { InfoButton, type InfoKey } from './InfoModal';
import { ThesisCard, type ThesisCardState } from './ThesisCard';
import { colors } from '../theme';

// --- formatting helpers ---------------------------------------------------
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const usd = (x: number) => `$${x.toFixed(2)}`;
const big = (millions: number) => {
  const abs = Math.abs(millions);
  if (abs >= 1_000_000) return `$${(millions / 1_000_000).toFixed(2)}T`;
  if (abs >= 1_000) return `$${(millions / 1_000).toFixed(1)}B`;
  return `$${millions.toFixed(0)}M`;
};
const signedPct = (x: number) => `${x >= 0 ? '+' : ''}${pct(x)}`;
/** A multiple value or em dash for `number | null` engine fields. */
const mult = (x: number | null) => (x == null ? '—' : `${x.toFixed(1)}x`);

// --- color helpers (tasteful, signal cells only) --------------------------

type Tone = 'good' | 'neutral' | 'bad' | 'muted';

const TONE_COLOR: Record<Tone, string> = {
  good: colors.green,
  neutral: colors.amber,
  bad: colors.red,
  muted: colors.subtext,
};

/** Map a tone to a color, or undefined to leave the cell at the default. */
const toneColor = (tone: Tone | null): string | undefined =>
  tone ? TONE_COLOR[tone] : undefined;

const marginTone = (x: number): Tone =>
  x >= 0.2 ? 'good' : x >= 0.08 ? 'neutral' : 'bad';
const roeTone = (x: number): Tone =>
  x >= 0.15 ? 'good' : x >= 0.08 ? 'neutral' : 'bad';
const mosTone = (x: number): Tone => (x > 0 ? 'good' : 'bad');

const CARD = 'mt-2 rounded-2xl border border-border bg-card p-4';
const GRID = 'grid grid-cols-2 gap-x-4';
const DIVIDER = 'h-px bg-border';

// =========================================================================

interface AnalysisViewProps {
  analysis: Analysis;
  prices: PricePoint[];
  pricesLoading: boolean;
  pricesFailed: boolean;
  comps: PeerComps | null;
  compsLoading: boolean;
  cachedThesis: Thesis | null;
  onThesisGenerated: (ticker: string, thesis: Thesis) => void;
  onOpenSettings: () => void;
}

export function AnalysisView({
  analysis,
  prices,
  pricesLoading,
  pricesFailed,
  comps,
  compsLoading,
  cachedThesis,
  onThesisGenerated,
  onOpenSettings,
}: AnalysisViewProps) {
  const { financials: f, metrics: m, reverseDcf, scores } = analysis;

  // Editable DCF assumptions — the only thing the sliders touch. Metrics and
  // scores are assumption-independent, so we keep them from the loaded analysis.
  const [assumptions, setAssumptions] = useState<ValuationAssumptions>(
    analysis.valuation.assumptions ?? DEFAULT_ASSUMPTIONS,
  );

  // Reset assumptions whenever a new company loads.
  useEffect(() => {
    setAssumptions(analysis.valuation.assumptions ?? DEFAULT_ASSUMPTIONS);
  }, [analysis]);

  // LIVE recompute on every slider tick — the engine is pure + synchronous.
  const liveRange: DcfRange = useMemo(
    () => computeDcfRange(f, assumptions),
    [f, assumptions],
  );
  const liveDcf = useMemo(() => runDcf(f, assumptions), [f, assumptions]);

  const set = (patch: Partial<ValuationAssumptions>) =>
    setAssumptions((a) => ({ ...a, ...patch }));
  const reset = () => setAssumptions(DEFAULT_ASSUMPTIONS);

  // --- AI thesis (BYOK) -------------------------------------------------
  // Local thesis for the active ticker, seeded from the session cache. It
  // resets whenever the analyzed company changes so a stale thesis never bleeds
  // across tickers.
  const [thesis, setThesis] = useState<Thesis | null>(cachedThesis);
  const [thesisLoading, setThesisLoading] = useState(false);
  const [thesisError, setThesisError] = useState<string | null>(null);

  // Reset to the per-ticker cached value (or empty) when the company changes.
  useEffect(() => {
    setThesis(cachedThesis);
    setThesisError(null);
    setThesisLoading(false);
  }, [analysis, cachedThesis]);

  // Guards against a stale in-flight request committing after a ticker switch.
  const thesisReqTicker = useRef<string | null>(null);

  const runThesis = async (refresh = false) => {
    const ticker = f.ticker;
    thesisReqTicker.current = ticker;
    setThesisLoading(true);
    setThesisError(null);
    try {
      // Optional personal key (BYOK override); the proxy falls back to the shared key.
      const key = await getAnthropicKey();
      const t = await generateThesis(analysis, key ?? undefined, refresh);
      if (thesisReqTicker.current !== ticker) return; // superseded
      setThesis(t);
      onThesisGenerated(ticker, t);
    } catch (e) {
      if (thesisReqTicker.current !== ticker) return;
      setThesisError(e instanceof Error ? e.message : 'Could not generate the thesis.');
    } finally {
      if (thesisReqTicker.current === ticker) setThesisLoading(false);
    }
  };

  const regenerate = () => {
    setThesis(null); // clear before regenerating
    void runThesis(true); // bypass the proxy cache for a fresh generation
  };

  const thesisState: ThesisCardState = thesisLoading
    ? { kind: 'loading' }
    : thesisError
      ? { kind: 'error', message: thesisError }
      : thesis
        ? { kind: 'ready', thesis }
        : { kind: 'idle' };

  return (
    <div>
      {/* Header card: identity, price, sparkline, valuation verdict + range */}
      <div className={CARD}>
        <div className="text-xl font-bold text-fg">{f.name}</div>
        <div className="mt-0.5 text-[13px] text-muted">{f.ticker}</div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-3xl font-extrabold text-fg">{usd(f.price)}</div>
          <VerdictPill verdict={liveRange.verdict} />
        </div>

        <div className="mt-4">
          <Sparkline data={prices} loading={pricesLoading} failed={pricesFailed} />
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <p className="text-[13px] leading-[19px] text-muted">
            DCF base {usd(liveRange.base)} · range {usd(liveRange.bear)}–
            {usd(liveRange.bull)} ({signedPct(liveDcf.upsideVsPrice)} vs price)
          </p>
          <p
            className="mt-1 text-[13px] font-semibold"
            style={{ color: toneColor(mosTone(liveRange.marginOfSafety)) }}
          >
            Margin of safety {signedPct(liveRange.marginOfSafety)} · WACC{' '}
            {pct(analysis.wacc.wacc)}
          </p>
        </div>
      </div>

      {/* Editable assumptions — drives the live recompute above */}
      <SectionHeader title="Assumptions" infoKey="dcf">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-border px-2 py-1 text-[13px] font-bold text-accent"
        >
          Reset
        </button>
      </SectionHeader>
      <div className={CARD}>
        <Slider
          label="Growth rate"
          value={assumptions.growthRate}
          min={0}
          max={0.25}
          step={0.005}
          onChange={(v) => set({ growthRate: v })}
          display={pct(assumptions.growthRate)}
        />
        <Slider
          label="Discount rate (WACC)"
          value={assumptions.discountRate}
          min={0.04}
          max={0.15}
          step={0.0025}
          onChange={(v) => set({ discountRate: v })}
          display={pct(assumptions.discountRate)}
        />
        <Slider
          label="Terminal growth"
          value={assumptions.terminalGrowth}
          min={0}
          max={0.04}
          step={0.0025}
          onChange={(v) => set({ terminalGrowth: v })}
          display={pct(assumptions.terminalGrowth)}
        />
        <Slider
          label="Forecast years"
          value={assumptions.years}
          min={5}
          max={15}
          step={1}
          onChange={(v) => set({ years: Math.round(v) })}
          display={`${assumptions.years} yr`}
        />
      </div>

      {/* Valuation range / DCF detail (live) */}
      <SectionHeader title="Valuation range" infoKey="marginOfSafety" />
      <div className={CARD}>
        <div className={GRID}>
          <Stat label="Bear" value={usd(liveRange.bear)} />
          <Stat label="Base" value={usd(liveRange.base)} />
          <Stat label="Bull" value={usd(liveRange.bull)} />
          <ColoredStat
            label="Margin of safety"
            value={signedPct(liveRange.marginOfSafety)}
            tone={mosTone(liveRange.marginOfSafety)}
          />
          <Stat
            label="Price-implied growth"
            value={
              reverseDcf.solved && reverseDcf.impliedGrowth != null
                ? pct(reverseDcf.impliedGrowth)
                : '—'
            }
          />
          <Stat label="WACC" value={pct(analysis.wacc.wacc)} />
        </div>
        <div className="mt-2 flex items-center">
          <span className="text-xs italic text-muted">
            {!reverseDcf.solved && reverseDcf.note
              ? reverseDcf.note
              : 'What is price-implied growth?'}
          </span>
          <InfoButton infoKey="reverseDcf" />
        </div>
      </div>

      {/* Valuation multiples */}
      <SectionHeader title="Multiples" infoKey="multiples" />
      <div className={CARD}>
        <div className={GRID}>
          <Stat label="Market cap" value={big(m.marketCap)} />
          <Stat label="Enterprise value" value={big(m.enterpriseValue)} />
          <Stat label="P/E" value={`${m.pe.toFixed(1)}x`} />
          <Stat label="EV / EBIT" value={`${m.evToEbit.toFixed(1)}x`} />
          <Stat label="EV / EBITDA" value={mult(m.evToEbitda)} />
          <Stat label="Price / FCF" value={`${m.priceToFcf.toFixed(1)}x`} />
        </div>
      </div>

      {/* Peer comps (own loading/absent state; hidden when null) */}
      <PeerCompsCard target={m} comps={comps} loading={compsLoading} />

      {/* Quality + health */}
      <SectionHeader title="Quality & health" />
      <div className={CARD}>
        <div className={GRID}>
          <ColoredStat
            label="Gross margin"
            value={pct(m.grossMargin)}
            tone={marginTone(m.grossMargin)}
          />
          <ColoredStat
            label="Operating margin"
            value={pct(m.operatingMargin)}
            tone={marginTone(m.operatingMargin)}
          />
          <ColoredStat
            label="Net margin"
            value={pct(m.netMargin)}
            tone={marginTone(m.netMargin)}
          />
          <ColoredStat
            label="FCF margin"
            value={pct(m.fcfMargin)}
            tone={marginTone(m.fcfMargin)}
          />
          <ColoredStat label="ROE" value={pct(m.roe)} tone={roeTone(m.roe)} />
          <Stat label="Debt / equity" value={`${m.debtToEquity.toFixed(2)}x`} />
          <Stat label="Revenue growth" value={pct(f.revenueGrowth)} />
          <Stat label="Net debt" value={big(m.netDebt)} />
        </div>
      </div>

      {/* Quality & risk scores */}
      <SectionHeader title="Quality & risk scores" />
      <div className={CARD}>
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center">
            <span className="text-[15px] font-semibold text-fg">
              Piotroski F-Score
            </span>
            <InfoButton infoKey="piotroski" />
          </div>
          <ScorePill {...piotroskiPill(scores.piotroski)} />
        </div>
        <div className={DIVIDER} />
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center">
            <span className="text-[15px] font-semibold text-fg">Altman Z″</span>
            <InfoButton infoKey="altman" />
          </div>
          <ScorePill {...altmanPill(scores.altmanZdd)} />
        </div>
        <div className={DIVIDER} />
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center">
            <span className="text-[15px] font-semibold text-fg">
              Beneish M-Score
            </span>
            <InfoButton infoKey="beneish" />
          </div>
          <ScorePill {...beneishPill(scores.beneishM)} />
        </div>
      </div>

      {/* AI thesis (BYOK) — Claude reasons over the engine numbers above */}
      <SectionHeader title="AI thesis" />
      <ThesisCard
        state={thesisState}
        onGenerate={() => void runThesis(false)}
        onRegenerate={regenerate}
        onOpenSettings={onOpenSettings}
      />

      <p className="mt-6 text-center text-[11px] text-muted">
        Live market data &amp; educational tooling — not investment advice.
      </p>
    </div>
  );
}

// --- section header with optional info + trailing slot -------------------

function SectionHeader({
  title,
  infoKey,
  children,
}: {
  title: string;
  infoKey?: InfoKey;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-6 flex items-center justify-between">
      <div className="flex items-center">
        <h2 className="text-base font-bold text-fg">{title}</h2>
        {infoKey ? <InfoButton infoKey={infoKey} /> : null}
      </div>
      {children}
    </div>
  );
}

// --- colored stat cell ----------------------------------------------------

function ColoredStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone | null;
}) {
  const color = toneColor(tone);
  return (
    <div className="py-2">
      <div className="mb-0.5 text-xs text-muted">{label}</div>
      <div
        className="text-[17px] font-semibold text-fg"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

// --- peer comps card ------------------------------------------------------

interface CompRow {
  label: string;
  multiple: string;
  percentile: number | null;
}

function PeerCompsCard({
  target,
  comps,
  loading,
}: {
  target: Metrics;
  comps: PeerComps | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <>
        <SectionHeader title="Peer comps" infoKey="comps" />
        <div className={CARD}>
          <span className="text-xs italic text-muted">Finding peers…</span>
        </div>
      </>
    );
  }
  // Hide entirely when there are no usable peers.
  if (!comps) return null;

  const r: CompsResult = comps.ranks;
  const rows: CompRow[] = [
    { label: 'P/E', multiple: `${target.pe.toFixed(1)}x`, percentile: r.pe },
    {
      label: 'EV / EBIT',
      multiple: `${target.evToEbit.toFixed(1)}x`,
      percentile: r.evToEbit,
    },
    {
      label: 'EV / EBITDA',
      multiple: mult(target.evToEbitda),
      percentile: r.evToEbitda,
    },
    {
      label: 'Price / FCF',
      multiple: `${target.priceToFcf.toFixed(1)}x`,
      percentile: r.priceToFcf,
    },
  ];

  return (
    <>
      <SectionHeader title="Peer comps" infoKey="comps" />
      <div className={CARD}>
        {rows.map((row, i) => (
          <div key={row.label}>
            {i > 0 ? <div className={DIVIDER} /> : null}
            <div className="flex items-center py-2">
              <span className="w-24 text-sm font-semibold text-fg">
                {row.label}
              </span>
              <span className="w-16 text-[15px] font-bold text-fg">
                {row.multiple}
              </span>
              <span
                className="flex-1 text-right text-xs font-semibold"
                style={{ color: toneColor(percentileTone(row.percentile)) }}
              >
                {percentileRead(row.percentile)}
              </span>
            </div>
          </div>
        ))}

        <div className="mt-2 border-t border-border pt-4">
          <div className="mb-2 text-xs text-muted">Compared with</div>
          <div className="flex flex-wrap gap-2">
            {comps.peers.map((p) => (
              <span
                key={p.ticker}
                className="rounded-full border border-border bg-bg px-2.5 py-1 text-xs font-bold text-muted"
              >
                {p.ticker}
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Engine percentile is "cheapness": higher = cheaper than more peers. Translate
 * to a plain read and a tone. Null (not computable) → muted "n/a".
 */
function percentileRead(p: number | null): string {
  if (p == null) return 'n/a';
  const ofPeers = Math.round(p * 100);
  if (p >= 0.6) return `cheaper than ${ofPeers}% of peers`;
  if (p <= 0.4) return `pricier than ${100 - ofPeers}% of peers`;
  return 'in line with peers';
}

function percentileTone(p: number | null): Tone | null {
  if (p == null) return 'muted';
  if (p >= 0.6) return 'good';
  if (p <= 0.4) return 'bad';
  return 'neutral';
}

// --- score pill -----------------------------------------------------------

/** A compact value + label pill, colored by tone (green/amber/red/muted). */
function ScorePill({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: Tone;
}) {
  const color = TONE_COLOR[tone];
  return (
    <div className="flex items-center gap-2">
      <span className="text-[17px] font-bold" style={{ color }}>
        {value}
      </span>
      <span
        className="rounded-full border px-2.5 py-[3px] text-xs font-bold capitalize"
        style={{ color, borderColor: color, backgroundColor: color + '22' }}
      >
        {label}
      </span>
    </div>
  );
}

function piotroskiPill(p: PiotroskiResult): { value: string; label: string; tone: Tone } {
  if (p.score == null) {
    return { value: '—', label: 'incomplete', tone: 'muted' };
  }
  const tone: Tone = p.score >= 7 ? 'good' : p.score >= 4 ? 'neutral' : 'bad';
  const label = p.score >= 7 ? 'strong' : p.score >= 4 ? 'mixed' : 'weak';
  return { value: `${p.score} / 9`, label, tone };
}

function altmanPill(a: AltmanResult): { value: string; label: string; tone: Tone } {
  const tone: Tone = a.zone === 'safe' ? 'good' : a.zone === 'grey' ? 'neutral' : 'bad';
  return { value: a.score.toFixed(2), label: a.zone, tone };
}

function beneishPill(b: BeneishResult): { value: string; label: string; tone: Tone } {
  if (b.mScore == null) {
    return { value: '—', label: 'incomplete', tone: 'muted' };
  }
  const tone: Tone = b.manipulationFlag ? 'bad' : 'good';
  const label = b.manipulationFlag ? 'flag' : 'clean';
  return { value: b.mScore.toFixed(2), label, tone };
}
