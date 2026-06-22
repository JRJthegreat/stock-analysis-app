import type { Thesis, ThesisPoint } from '../data/thesis';
import { colors } from '../theme';

// Verdict → theme color. Mirrors the bull/neutral/bear semantics.
const VERDICT_COLOR: Record<Thesis['verdict'], string> = {
  Bullish: colors.green,
  Neutral: colors.amber,
  Bearish: colors.red,
};

/** Colored pill for the thesis verdict — same shape as VerdictPill. */
function ThesisVerdictPill({ verdict }: { verdict: Thesis['verdict'] }) {
  const color = VERDICT_COLOR[verdict];
  return (
    <span
      className="inline-block rounded-full border px-3 py-[5px] text-[13px] font-bold"
      style={{ color, borderColor: color, backgroundColor: color + '22' }}
    >
      {verdict}
    </span>
  );
}

/** One bull/bear point: a claim with the engine figure cited beneath it. */
function PointRow({ item }: { item: ThesisPoint }) {
  return (
    <div className="mb-4">
      <p className="text-sm font-bold leading-5 text-fg">{item.point}</p>
      <p className="mt-[3px] text-[13px] leading-5 text-muted">{item.evidence}</p>
    </div>
  );
}

function Subsection({
  title,
  color,
  children,
}: {
  title: string;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 border-t border-border pt-4">
      <p
        className="mb-2 text-sm font-extrabold uppercase tracking-wide text-fg"
        style={color ? { color } : undefined}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

export type ThesisCardState =
  | { kind: 'noKey' }
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; thesis: Thesis };

interface ThesisCardProps {
  state: ThesisCardState;
  onGenerate: () => void;
  onRegenerate: () => void;
  onOpenSettings: () => void;
}

/** True when an error message is about the API key (offer Settings). */
function isKeyError(message: string): boolean {
  return /\bkey\b/i.test(message);
}

const CARD = 'mt-2 rounded-2xl border border-border bg-card p-4';
const PRIMARY_BTN =
  'mt-4 w-full rounded-xl bg-accent py-3 text-[15px] font-bold text-white disabled:opacity-60';

export function ThesisCard({
  state,
  onGenerate,
  onRegenerate,
  onOpenSettings,
}: ThesisCardProps) {
  if (state.kind === 'noKey') {
    return (
      <div className={CARD}>
        <p className="text-sm leading-relaxed text-muted">
          Add your Anthropic API key to generate a sourced AI thesis — your key,
          your usage, stored in your browser.
        </p>
        <button type="button" className={PRIMARY_BTN} onClick={onOpenSettings}>
          Open Settings
        </button>
      </div>
    );
  }

  if (state.kind === 'idle') {
    return (
      <div className={CARD}>
        <button type="button" className={PRIMARY_BTN} onClick={onGenerate}>
          Generate AI thesis
        </button>
        <p className="mt-4 text-[11px] leading-4 text-muted">
          Reasoned over the engine numbers above — not investment advice.
        </p>
      </div>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div className={CARD}>
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent"
            aria-hidden
          />
          <span className="text-sm text-muted">Analyzing… (this can take ~30s)</span>
        </div>
        <button type="button" className={PRIMARY_BTN} disabled>
          Generating…
        </button>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className={CARD}>
        <p className="text-sm font-semibold leading-relaxed text-red">
          {state.message}
        </p>
        <div className="flex gap-2">
          <button type="button" className={PRIMARY_BTN} onClick={onGenerate}>
            Try again
          </button>
          {isKeyError(state.message) ? (
            <button
              type="button"
              className="mt-4 rounded-xl border border-border px-4 py-3 text-[15px] font-bold text-accent"
              onClick={onOpenSettings}
            >
              Open Settings
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // ready
  const t = state.thesis;
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between">
        <ThesisVerdictPill verdict={t.verdict} />
        <button
          type="button"
          onClick={onRegenerate}
          className="text-[13px] font-bold text-accent"
        >
          Regenerate
        </button>
      </div>

      <p className="mt-4 text-[15px] leading-[22px] text-fg">{t.summary}</p>

      {t.bull.length > 0 ? (
        <Subsection title="Bull case" color={colors.green}>
          {t.bull.map((p, i) => (
            <PointRow key={`bull-${i}`} item={p} />
          ))}
        </Subsection>
      ) : null}

      {t.bear.length > 0 ? (
        <Subsection title="Bear case" color={colors.red}>
          {t.bear.map((p, i) => (
            <PointRow key={`bear-${i}`} item={p} />
          ))}
        </Subsection>
      ) : null}

      {t.moat ? (
        <Subsection title="Moat">
          <p className="text-sm leading-relaxed text-fg">{t.moat}</p>
        </Subsection>
      ) : null}

      {t.risks.length > 0 ? (
        <Subsection title="Risks">
          {t.risks.map((r, i) => (
            <div key={`risk-${i}`} className="mb-1 flex">
              <span className="mr-2 text-sm leading-relaxed text-muted">•</span>
              <span className="flex-1 text-sm leading-relaxed text-fg">{r}</span>
            </div>
          ))}
        </Subsection>
      ) : null}

      {t.valuationView ? (
        <Subsection title="Valuation view">
          <p className="text-sm leading-relaxed text-fg">{t.valuationView}</p>
        </Subsection>
      ) : null}

      <p className="mt-4 text-[11px] leading-4 text-muted">
        Generated by Claude over the engine numbers above — not investment advice.
      </p>
    </div>
  );
}
