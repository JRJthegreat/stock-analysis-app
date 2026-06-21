# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Stock Analyst — project guide

Mobile-first stock analysis app. Personal-use MVP first (the owner's own investing),
designed so it can grow into a product for serious DIY retail investors.

## ⚠️ Hard constraint: Expo SDK 54 (do not break this)

The app must keep loading in **Expo Go 54.0.2** on the owner's iPhone during the MVP
phase. Expo Go only runs apps built on the SDK it ships with.

- **Pinned to Expo SDK 54** (`expo ~54.x`, React Native 0.81, React 19.1).
- **Do NOT upgrade the SDK** or run `expo install --fix` toward a newer SDK without an
  explicit decision — it will produce "Project is incompatible with this version of
  Expo Go" on the phone.
- **Do NOT add libraries that require a custom dev build / native modules** while we are
  on Expo Go (no unprebuilt native deps). Prefer packages installed via `npx expo install`
  that are supported by Expo Go. Anything needing `expo prebuild` waits until we
  deliberately move off Expo Go to a development build.
- **Expo APIs change between SDK versions.** Before writing any Expo/RN code, consult the
  versioned docs at https://docs.expo.dev/versions/v54.0.0/ (per `AGENTS.md`) — don't rely
  on memory of a different SDK.
- **New Architecture is on** (`newArchEnabled: true` in `app.json`). One more reason any
  native dependency must be New-Arch- and Expo-Go-compatible before it goes in.

## Architecture (the core idea)

Two layers, strictly separated:

1. **`src/engine/` — the durable asset.** Pure TypeScript: data types, metric math,
   DCF, comps. No React, no network, no I/O. Same input → same output. This code ports
   unchanged into a backend later.
2. **`src/screens/` + `src/components/` — the throwaway UI.** React Native views that
   call the engine and render results.

**THE RULE: the LLM never does math.** All numbers come from `src/engine/`. When the AI
thesis layer lands, Claude reasons *over* already-computed numbers and cites them; it
must never produce a figure itself. This is what makes the output trustworthy.

## Data flow

`analyzeTicker(ticker)` → looks up `MOCK_FINANCIALS[ticker]` → `analyzeFinancials(f, assumptions)`
→ `{ financials, computeMetrics(f), runDcf(f, assumptions) }` → `Analysis`. `HomeScreen`
renders the `Analysis`; components (`Stat`, `VerdictPill`) are pure presentational.

The whole engine is **synchronous and offline** today. When the data layer lands,
`analyzeTicker` becomes `async` (returns `Promise<Analysis>`) and pulls live fundamentals —
the screen already treats it as a single call, so that change stays contained to `analyze.ts`.

## Engine API (import only from `src/engine`)

`src/engine/index.ts` re-exports everything; the UI imports from `'../engine'`, never from
individual files, so internals can be refactored freely.

- `analyzeTicker(ticker, assumptions?) → Analysis | null` — MVP entry point; `null` = unknown ticker.
- `analyzeFinancials(f, assumptions?) → Analysis` — run the pipeline on already-fetched fundamentals.
- `getAvailableTickers() → string[]` — currently the mock keys: **AAPL, MSFT, NVDA**. Drives
  the ticker quick-chips in `HomeScreen`, so adding a key to `MOCK_FINANCIALS` surfaces it in the UI automatically.
- `computeMetrics(f) → Metrics`, `runDcf(f, a) → Valuation`, `DEFAULT_ASSUMPTIONS`.
- DCF verdict is threshold-based: upside `> +15%` → Undervalued, `< -15%` → Overvalued, else Fairly valued.

**Engine v2 (SOTA models, all pure + tested, re-exported from `index.ts`):**
- `Financials` now carries full statement line items + an optional `prior` (previous FY) snapshot —
  `prior` is required for Piotroski/Beneish, which degrade gracefully (flagged incomplete) without it.
- `computeWacc(f, inputs?)` — CAPM WACC (defaults: rf 4.5%, ERP 5%, tax 21%, beta 1).
- `dcfRange(f, a?, flex?)` — multi-stage FCFF DCF with bear/base/bull range + `marginOfSafety`.
- `reverseDcf(f, a?)` — bisection solve for the FCF growth the current price implies.
- `altmanZ` / `altmanZdd` (Z & Z″), `piotroski` (0–9), `beneishM` (earnings-manipulation flag).
- `ddm(f, …)` — Gordon-growth DDM for dividend payers (null for non-payers).
- `rankAgainstPeers(target, peers)` — percentile ranks on valuation multiples (pure; no fetching).
- `Analysis` extended additively with `wacc, dcfRange, reverseDcf, scores, ddm`.
- ⚠️ These v2 outputs are **computed but not yet rendered** — `HomeScreen` still shows only
  `metrics` + `valuation`. Surfacing them in the UI is a pending task.

## Layout

```
App.tsx                  # renders <HomeScreen/>
index.ts                 # registerRootComponent(App) — Expo entry
src/
  engine/                # pure TS — metrics, valuation, types (math lives here)
    types.ts             # domain types (Financials, Metrics, Valuation, Analysis)
    metrics.ts           # computeMetrics()
    valuation.ts         # runDcf(), DEFAULT_ASSUMPTIONS
    mockData.ts          # MOCK_FINANCIALS — offline placeholder fundamentals (replace with data layer)
    analyze.ts           # analyzeTicker() / analyzeFinancials() — MVP entry points
    index.ts             # public surface (import from here)
  components/            # presentational RN components (Stat, VerdictPill)
  screens/              # full screens (HomeScreen)
  theme.ts              # colors + spacing tokens (dark theme)
```

## Commands

```bash
cd /Users/air/stock-analysis-app
npx expo start            # scan the QR code with Expo Go (iOS camera)
# in the running dev server: press w for web preview, or i / a for simulators
npm run ios | android | web   # same as `expo start --<platform>`
npm run web               # React Native Web preview in Chrome → http://localhost:8081

npm test                  # Vitest — engine unit tests (npx vitest run)
npx tsc --noEmit          # typecheck (strict mode)
```

**Verification gates:** `npm test` (engine math) and `npx tsc --noEmit` must both stay green.
Tests are **Vitest** (a devDependency only — never imported by app code, never bundled by
Metro, so it does not affect Expo Go). They live in `src/engine/__tests__/` and lock the
financial math with hand-checked numeric expectations. Keep new tests on `src/engine/` (pure
functions); the UI layer is not unit-tested. Web preview needs `react-dom`, `react-native-web`,
`@expo/metro-runtime` (installed; web-only, not native modules — Expo Go constraint untouched).

## Conventions

- TypeScript strict mode. Functional components + hooks. `StyleSheet.create` for styles.
- Data flows engine → screen. Screens hold UI state only, never business math.
- Money is stored in USD **millions** inside `Financials`; format at the view layer
  (see the `pct` / `usd` / `big` helpers in `HomeScreen.tsx`).
- Keep `analyzeTicker()` as the single entry point so swapping mock → live data is a
  one-file change.

## Roadmap (production plan)

1. ✅ Scaffold (SDK 54) + offline MVP: ticker → metrics + DCF on device.
2. ✅ **Engine v2 (SOTA, pure + tested):** WACC/CAPM, multi-stage DCF + range, reverse DCF,
   Altman Z/Z″, Piotroski, Beneish M, DDM, comps. 44 Vitest tests. *(UI wiring still pending.)*
3. **Backend on Supabase:** secrets proxy (FMP + Anthropic keys never in the client) + per-ticker
   cache (keeps data/LLM cost flat at scale). Gating item — everything below depends on it.
4. **Data layer:** FMP client behind the proxy → real fundamentals, mapped into the expanded
   `Financials` (incl. the `prior`-year snapshot the scores need); replaces `MOCK_FINANCIALS`.
   `analyzeTicker` becomes `async`. (SEC EDGAR cache later.)
5. **Surface engine v2 in the UI** + editable DCF assumptions (sliders) + scores/comps cards.
6. **AI thesis:** Claude structured output over engine numbers, with citations (never invents figures).
7. **Brokerage connect — deferred.** No official Robinhood third-party equities API exists; do NOT
   use the reverse-engineered private API (ToS violation, handles raw credentials). When added, use
   an aggregator — **SnapTrade** (read holdings + optional trading, covers Robinhood et al.) or
   **Plaid Investments** (read-only). OAuth token exchange must be server-side (Supabase).
8. **Production distribution:** EAS Build (standalone binary → TestFlight/App Store). Expo Go stays
   for dev. Trading, if enabled, is regulated — owner owns the compliance/legal posture.

## Security flags (before any public release)

- API keys (FMP, Anthropic) embedded in a mobile client are extractable. Fine for the
  personal MVP; **move them behind a backend proxy before distributing the app.**
- Per-ticker analysis caching (not per-user) is what keeps data + LLM costs flat at scale.

## Subagents (see `.claude/agents/`)

- `finance-engine` — the math in `src/engine/` (pure, tested).
- `mobile-ui-engineer` — Expo/React Native screens & components (Expo Go safe).
- `data-integration` — FMP / SEC EDGAR clients, caching, types.
- `ai-thesis` — Claude thesis layer (structured output, cites engine numbers).
- `rn-code-reviewer` — reviews diffs for correctness + Expo Go compatibility.
