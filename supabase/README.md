# Supabase backend — `fmp-proxy` + per-ticker cache

Holds the FMP API key **server-side** and caches assembled `Financials` (one row
per ticker, see `src/engine/types.ts`) so repeat analyses don't re-hit FMP. The
mobile app only ever uses the **public anon key**; the FMP key never leaves the
server.

## One-time deploy (run from the repo root)

The owner runs the two secret/interactive commands (1 and 4); the rest are automatable.

1. **Log in** — token is stored in your keychain, never shared:
   ```bash
   npx supabase login
   ```
2. **Link** the project (get the ref from the dashboard URL or `npx supabase projects list`):
   ```bash
   npx supabase link --project-ref <PROJECT_REF>
   ```
3. **Push the cache table**:
   ```bash
   npx supabase db push
   ```
4. **Set the FMP key** as a function secret — stays server-side:
   ```bash
   npx supabase secrets set FMP_API_KEY=<your_fmp_key>
   ```
5. **Deploy the function**:
   ```bash
   npx supabase functions deploy fmp-proxy
   ```

Endpoint: `https://<PROJECT_REF>.supabase.co/functions/v1/fmp-proxy?ticker=AAPL`
(call with `Authorization: Bearer <anon-key>`).

## App config (public-safe — NOT secrets)

Put these in a root `.env` (see `.env.example`); both are safe to ship in the client:

```
EXPO_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

## Notes

- `supabase/functions/fmp-proxy/fmp.ts` maps FMP's **`/stable`** API → `Financials`
  (legacy `/api/v3` was retired 2025-08-31). Verified live against AAPL/MSFT/NVDA.
- The function requires a valid JWT by default (the anon key qualifies) — keep it on.
- FMP free tier is rate-limited (~250 req/day, limited endpoints); a paid tier is the
  main recurring data cost for production.
