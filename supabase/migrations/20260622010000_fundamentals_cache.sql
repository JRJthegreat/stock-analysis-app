-- Per-ticker fundamentals cache.
--
-- The `fmp-proxy` edge function fetches FMP once, assembles the engine's
-- `Financials` (see src/engine/types.ts), and stores it here so repeat analyses
-- don't re-hit FMP. This is what keeps data (and later LLM) cost flat as usage
-- grows — the cache is per TICKER, not per user.

create table if not exists public.fundamentals_cache (
  ticker      text primary key,
  payload     jsonb       not null,          -- assembled Financials JSON
  fetched_at  timestamptz not null default now()
);

create index if not exists fundamentals_cache_fetched_at_idx
  on public.fundamentals_cache (fetched_at);

-- Lock the table down. The edge function talks to it with the service-role key,
-- which bypasses RLS. With RLS enabled and NO policies, the public anon key (the
-- only key shipped in the mobile app) cannot read or write the cache directly —
-- clients must go through the function. Defense in depth.
alter table public.fundamentals_cache enable row level security;
