# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Stock Analyst — project guide

Web stock-analysis app. Personal-use MVP first (the owner's own investing), designed so it
can grow into a product for serious DIY retail investors.

> **History:** this started as an Expo / React Native app (Expo Go, SDK 54) and **pivoted to a
> Next.js web app on 2026-06-22**. The pure `src/engine/` (and its 44 tests) ported across
> **unchanged** — which was the entire point of the engine/UI split. All React Native / Expo
> code is gone; do not reintroduce it.

## Stack

- **Next.js 15 (App Router)** + **React 19.1** + **TypeScript** (strict mode).
- **Tailwind CSS v4** — config-less; theme tokens are declared in `src/app/globals.css` via
  `@theme` (e.g. `--color-accent` → `bg-accent` / `text-accent`). No `tailwind.config.js`.
- **Vitest** for engine unit tests (dev-only; never imported by the app, never bundled).
- **Supabase** edge functions (Deno) as the backend / data proxy — untouched by the pivot.
- No React Native, no Expo, no native modules — plain web.

## Architecture (the core idea)

Two layers, strictly separated:

1. **`src/engine/` — the durable asset.** Pure TypeScript: data types, metric math, DCF, comps,
   scores. No React, no network, no I/O. Same input → same output. Ports unchanged into a backend
   later (and just survived a full UI-platform swap without a line changing).
2. **`src/app/` + `src/components/` — the disposable UI.** Next.js App Router pages + React
   components that call the engine and render results.

**THE RULE: the LLM never does math.** All numbers come from `src/engine/`. The AI thesis layer
reasons *over* already-computed numbers and cites them; it must never produce a figure itself.
This is what makes the output trustworthy.

## Data flow

**Live path:** `src/app/page.tsx` (Client Component) → `fetchFinancials(ticker)`
(`src/data/fundamentals.ts`, the ONLY network layer) → calls the Supabase **`simfin-proxy`** edge
function → returns `Financials` → `analyzeFinancials(f, assumptions)` → `Analysis` → rendered by
`src/components/AnalysisView.tsx`. Presentational components (`Stat`, `VerdictPill`, …) hold no math.

The DCF assumption **sliders recompute live** by calling the pure synchronous engine
(`dcfRange` / `runDcf`) on every change — no refetch. The price **sparkline** (`fetchPrices`) and
**peer comps** (`fetchPeerComps`) are independent side-loads that fail in isolation (never break the page).

The **engine stays synchronous and pure** — all I/O lives in `src/data/`, never in `src/engine/`.
`analyzeTicker(ticker)` + `MOCK_FINANCIALS` (the old offline path) now back only the engine's Vitest suite.

## Engine API (import only from `src/engine`)

`src/engine/index.ts` re-exports everything; the UI imports from `'../engine'`, never from
individual files, so internals can be refactored freely.

- `analyzeFinancials(f, assumptions?) → Analysis` — run the pipeline on already-fetched
  fundamentals. **This is the live entry point.**
- `analyzeTicker(ticker, assumptions?) → Analysis | null` — runs on `MOCK_FINANCIALS`; `null` =
  unknown ticker. **Used only by the tests now.**
- `computeMetrics(f) → Metrics`, `runDcf(f, a) → Valuation`, `DEFAULT_ASSUMPTIONS`.
- DCF verdict is threshold-based: upside `> +15%` → Undervalued, `< -15%` → Overvalued, else Fairly valued.

**Engine v2 (SOTA models, all pure + tested, re-exported from `index.ts`):**
- `Financials` carries full statement line items + an optional `prior` (previous FY) snapshot —
  `prior` is required for Piotroski/Beneish, which degrade gracefully (flagged incomplete) without it.
- `computeWacc(f, inputs?)` — CAPM WACC (defaults: rf 4.5%, ERP 5%, tax 21%, beta 1).
- `dcfRange(f, a?, flex?)` — multi-stage FCFF DCF with bear/base/bull range + `marginOfSafety`.
- `reverseDcf(f, a?)` — bisection solve for the FCF growth the current price implies.
- `altmanZ` / `altmanZdd` (Z & Z″), `piotroski` (0–9), `beneishM` (earnings-manipulation flag).
- `ddm(f, …)` — Gordon-growth DDM for dividend payers (null for non-payers).
- `rankAgainstPeers(target, peers)` — percentile ranks on valuation multiples (pure; no fetching).
- `Analysis` extended additively with `wacc, dcfRange, reverseDcf, scores, ddm`.
- ✅ All v2 outputs are **surfaced in `src/components/AnalysisView.tsx`** (valuation range,
  margin of safety, reverse-DCF implied growth, WACC, Piotroski / Altman Z″ / Beneish pills, live sliders).

## Layout

```
next.config.mjs          # Next config
postcss.config.mjs       # Tailwind v4 PostCSS plugin
tsconfig.json            # Next + strict TS (excludes supabase/)
vitest.config.ts         # engine tests only (dev-only)
src/
  app/                   # Next.js App Router
    layout.tsx           # root layout (<html><body>, metadata, viewport)
    page.tsx             # main screen: search, fetch, race handling, state ('use client')
    globals.css          # Tailwind import + @theme dark tokens + range-slider CSS
    icon.png             # favicon
  engine/                # pure TS — metrics, valuation, scores, types (math lives here)
    types.ts metrics.ts valuation.ts reverseDcf.ts scores.ts dividend.ts comps.ts
    analyze.ts mockData.ts index.ts        # index.ts = public surface (import from here)
    __tests__/           # Vitest specs (44 tests)
  data/                  # network layer (the ONLY I/O) → Supabase simfin-proxy
    fundamentals.ts      # fetchFinancials / fetchPrices / fetchPeers
    comps.ts             # fetchPeerComps → engine rankAgainstPeers
    thesis.ts            # BYOK thesis client → thesis-proxy
    secureStore.ts       # Anthropic key in browser localStorage (SSR-safe)
  components/            # React components: AnalysisView + presentational pieces
                         #   Slider (native <input type=range>), Sparkline (inline SVG),
                         #   InfoModal, SettingsModal, ThesisCard, Skeleton, Stat, VerdictPill
  theme.ts               # color hexes for runtime-driven styling (mirror globals.css @theme)
supabase/                # Deno edge functions + cache migration (excluded from app tsconfig)
```

## Commands

```bash
cd /Users/air/stock-analysis-app
npm run dev               # next dev → http://localhost:3000
npm run build             # next build (production; also type-checks)
npm start                 # serve the production build

npm test                  # Vitest — engine unit tests (vitest run)
npx tsc --noEmit          # typecheck (strict mode)
```

**Verification gates:** `npm test` (engine math), `npx tsc --noEmit`, and `npm run build` must all
stay green. Tests are **Vitest** (a devDependency only — never imported by app code, never bundled).
They live in `src/engine/__tests__/` and lock the financial math with hand-checked numeric
expectations. Keep new tests on `src/engine/` (pure functions); the UI layer is not unit-tested.

## Conventions

- TypeScript strict mode. Functional components + hooks. Interactive components must be Client
  Components (`'use client'`); the rest can stay server components.
- **Styling: Tailwind utilities** for static styles; **inline `style`** only for runtime-driven
  colors (verdict/score pills, sparkline stroke, tone-colored cells) — Tailwind can't see
  dynamically-built class names. Color hexes live in `src/theme.ts` and MUST mirror the `@theme`
  tokens in `src/app/globals.css`.
- Data flows engine → page/component. UI holds view state only, never business math.
- Money is stored in USD **millions** inside `Financials`; format at the view layer (`pct` / `usd` /
  `big` helpers in `AnalysisView.tsx`).
- Network/I/O lives ONLY in `src/data/` (`fetchFinancials` → Supabase `simfin-proxy`); the engine
  stays pure and synchronous.
- Public client env vars are **`NEXT_PUBLIC_SUPABASE_*`** (in `.env`). Next only inlines
  `NEXT_PUBLIC_*` into the client bundle — anything else stays server/CLI-side.

## Roadmap (production plan)

1. ✅ Offline MVP + engine: ticker → metrics + DCF.
2. ✅ **Engine v2 (SOTA, pure + tested):** WACC/CAPM, multi-stage DCF + range, reverse DCF,
   Altman Z/Z″, Piotroski, Beneish M, DDM, comps. 44 Vitest tests.
3. ✅ **Backend on Supabase (deployed):** project `lcfatnkvvjwaxlbfaqij` (region ap-southeast-2).
   `fmp-proxy` edge function holds the FMP key server-side, caches assembled `Financials` per ticker
   in `fundamentals_cache` (RLS on; function uses service role). Call with the anon key. Public client
   config is `NEXT_PUBLIC_SUPABASE_*` in `.env`; deploy steps in `supabase/README.md`.
4. ✅ **Data layer — SimFin (free, $0):** the app calls **`simfin-proxy`** (`supabase/functions/simfin-proxy/`),
   fronting **SimFin** — standardized fundamentals + daily prices for ~5,000 US stocks on the free tier
   (`SIMFIN_API_KEY`). Same `kind=financials|prices|peers` interface + `fundamentals_cache` table as
   `fmp-proxy`, so the app + engine are unchanged. `fmp-proxy` stays deployed as a paid fallback for
   micro-caps SimFin's ~5k list misses. Notes: beta defaults to 1 (SimFin has none); **peer comps are
   sector-based and noisy**, so the card hides when <3 valid peers (proper peer quality is a TODO).
5. ✅ **App wired to live data + engine v2 surfaced:** `src/data/fundamentals.ts` calls `simfin-proxy`
   (anon key + `NEXT_PUBLIC_SUPABASE_*`); the page fetches async with loading/error/race handling and
   runs `analyzeFinancials` (engine stays pure). `AnalysisView` shows the valuation range (bear/base/bull),
   margin of safety, reverse-DCF implied growth, WACC, and Piotroski/Altman Z″/Beneish pills.
6. ✅ **Full interactive UI:** live DCF assumption **sliders** (`Slider.tsx`, native `<input type=range>`)
   that recompute valuation through the pure sync engine; price **sparkline** (`Sparkline.tsx`, inline SVG);
   **peer comps** (`src/data/comps.ts` → engine `rankAgainstPeers`); color-coding; an info-modal **glossary**
   (`InfoModal.tsx`); skeleton loaders.
7. ✅ **AI thesis (shared key by default, BYOK override):** `thesis-proxy` edge function calls **Opus 4.8**
   (`claude-opus-4-8`) with adaptive thinking + structured output over the engine numbers — cites them,
   invents none (model/params per the `claude-api` skill). By default it uses a **shared `ANTHROPIC_API_KEY`
   function secret** (server-side only — never in the client bundle), so anyone can generate a thesis with no
   setup. A user can optionally supply their **own key** (`SettingsModal.tsx` → `src/data/secureStore.ts` →
   browser `localStorage`), which takes precedence for their request (runs on their quota). `ThesisCard.tsx`.
   **Cost guards** (the shared key bills the owner): `thesis-proxy` caches the thesis **per ticker**
   (`__thesis__#<TICKER>` row in `fundamentals_cache`, TTL `THESIS_TTL_HOURS`, default 24h; `refresh:true`
   from "Regenerate" bypasses it) and enforces a **daily cap** on shared-key generations (`__thesis_count__`
   row, `THESIS_DAILY_CAP`, default 200 → 429 past the cap). BYOK requests bypass both. Set/rotate the key with
   `supabase secrets set ANTHROPIC_API_KEY=… --project-ref <ref>` then `supabase functions deploy thesis-proxy`.
8. ✅ **Pivoted to a Next.js web app (2026-06-22):** replaced the Expo/RN UI with Next.js 15 (App
   Router) + Tailwind v4. `src/engine/` and the Supabase backend were untouched; `src/data/` changed
   only at the edges (`NEXT_PUBLIC_*` env vars; `secureStore` → `localStorage`). Verified in Chrome:
   live AAPL analysis, slider recompute flips the verdict, settings modal, `next build` clean.
9. **Brokerage connect — deferred.** No official Robinhood third-party equities API exists; do NOT
   use the reverse-engineered private API (ToS violation, handles raw credentials). When added, use an
   aggregator — **SnapTrade** (read holdings + optional trading) or **Plaid Investments** (read-only).
   OAuth token exchange must be server-side (Supabase).
10. **Production distribution:** deploy the Next app to **Vercel** (or any Node host) via `npm run build`.
    Trading, if enabled, is regulated — the owner owns the compliance/legal posture.

## Security flags (before any public release)

- The Supabase **anon key + URL are public by design** and safe in the client. Real secrets
  (SimFin/FMP keys, Supabase service-role + access token, any server Anthropic key) live only in
  Supabase function secrets and the gitignored `.env` — never in the client bundle.
- **AI thesis key:** a shared `ANTHROPIC_API_KEY` lives as a Supabase *function secret* (server-side
  only — never in the client bundle) so theses work with no setup; a user's optional own key (browser
  `localStorage`) overrides it. Shared usage bills the owner, so it's guarded by a per-ticker thesis cache
  + a daily cap in `thesis-proxy` (`THESIS_DAILY_CAP`); raise/lower the cap before scaling traffic.
- Per-ticker analysis caching (not per-user) is what keeps data + LLM costs flat at scale.

## Subagents (see `.claude/agents/`)

- `finance-engine` — the math in `src/engine/` (pure, tested). ✓ still apt.
- `data-integration` — Supabase proxies (SimFin/FMP), caching, types. ✓ still apt.
- `ai-thesis` — Claude thesis layer (structured output, cites engine numbers). ✓ still apt.
- `mobile-ui-engineer` / `rn-code-reviewer` — **legacy (React Native era).** The UI is now Next.js
  web; treat UI work as standard React + Tailwind. Their Expo/Expo-Go guidance no longer applies.
