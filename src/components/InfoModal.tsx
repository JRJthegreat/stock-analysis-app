'use client';

import { useState } from 'react';

/** Keys for the plain-language glossary. */
export type InfoKey =
  | 'dcf'
  | 'marginOfSafety'
  | 'wacc'
  | 'reverseDcf'
  | 'piotroski'
  | 'altman'
  | 'beneish'
  | 'comps'
  | 'multiples';

interface Entry {
  title: string;
  body: string;
}

/**
 * Short, jargon-free explanations. Copy is intentionally plain — these target
 * retail users who have never seen an "M-Score".
 */
export const INFO: Record<InfoKey, Entry> = {
  dcf: {
    title: 'Intrinsic value (DCF)',
    body: 'A discounted cash flow estimates what the business is worth today by adding up all the cash it should generate in the future, discounted back because money later is worth less than money now. We show a bear / base / bull range because the answer depends heavily on your assumptions — drag the sliders to see how.',
  },
  marginOfSafety: {
    title: 'Margin of safety',
    body: 'How far below our central (base-case) intrinsic value the stock is trading. A positive number means the price sits below our estimate, leaving a cushion if we are too optimistic. Negative means the market is paying more than our estimate.',
  },
  wacc: {
    title: 'WACC (discount rate)',
    body: 'The blended return investors require to hold this company, weighing both its stock and its debt. We use it to discount future cash flows: a higher WACC means future cash is worth less today, which lowers the intrinsic value.',
  },
  reverseDcf: {
    title: 'Price-implied growth',
    body: 'Instead of guessing growth and getting a value, we work backwards: what yearly cash-flow growth would the company need to justify today’s price? If that number looks unrealistically high, the stock may be expensive; if low, it may be cheap.',
  },
  piotroski: {
    title: 'Piotroski F-Score',
    body: 'A 0–9 health checklist covering profitability, debt, and efficiency, each worth one point. Roughly: 7–9 is strong, 4–6 mixed, below 4 weak. It rewards companies that are improving year over year.',
  },
  altman: {
    title: 'Altman Z″',
    body: 'A bankruptcy-risk gauge. Higher is safer. "Safe" means low distress risk, "grey" is a caution zone, and "distress" flags elevated risk of financial trouble. We use the Z″ variant tuned for non-manufacturers.',
  },
  beneish: {
    title: 'Beneish M-Score',
    body: 'A statistical screen for signs that earnings may have been manipulated. "Clean" means nothing unusual showed up; a "flag" means the numbers look more like companies that later restated. It is a yellow light, not a verdict.',
  },
  comps: {
    title: 'Peer percentile',
    body: 'How cheap this stock looks on each valuation multiple compared with similar companies. "Cheaper than 80% of peers" means only 20% of the peer set trades at a lower multiple — lower multiples generally mean cheaper.',
  },
  multiples: {
    title: 'Valuation multiples',
    body: 'Quick price tags relative to the business. P/E is price per dollar of earnings; EV/EBIT and EV/EBITDA compare the whole company (including debt) to its operating profit; Price/FCF compares it to the free cash it produces. Lower usually means cheaper.',
  },
};

/**
 * A small "ⓘ" affordance that opens a modal with a plain-language explanation.
 */
export function InfoButton({ infoKey }: { infoKey: InfoKey }) {
  const [open, setOpen] = useState(false);
  const entry = INFO[infoKey];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`What is ${entry.title}?`}
        className="ml-1 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-muted text-[11px] font-bold italic leading-none text-muted"
      >
        i
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-extrabold text-fg">{entry.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{entry.body}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-[10px] bg-accent px-4 py-2 font-bold text-white"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
