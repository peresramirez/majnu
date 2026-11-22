-- Majnu: what the fallback API keys have spent, per provider and month
-- (issue #67; docs/features/provider-fallbacks.md).
--
-- Anthropic, OpenAI and Daytona each have an optional second key
-- (ANTHROPIC_API_KEY_FALLBACK, OPENAI_API_KEY_FALLBACK,
-- DAYTONA_API_KEY_FALLBACK). The app uses one only when the primary key
-- cannot be used at all (it was refused for its key, its spend limit or its
-- quota), and spends at most FALLBACK_CAP_USD (default 150) on each fallback
-- per calendar month (UTC). This table is that running total. Calls made with
-- the primary keys are not counted here: their limits are set in the
-- providers' own consoles.
--
-- How the cap holds under concurrent calls (lib/providers/ledger.ts):
-- 1. Before a fallback call, server code reserves an upper-bound estimate of
--    its cost with reserve_provider_spend(). The function adds it only if the
--    total stays within the cap, in one INSERT ... ON CONFLICT DO UPDATE ...
--    WHERE statement. Concurrent reservations for the same provider and month
--    wait for each other's row lock, and each re-checks the WHERE against the
--    total the one before it left, so a burst of parallel calls cannot all
--    pass a cap that only one of them fits under.
-- 2. When the call has finished, settle_provider_spend() replaces the
--    reservation with the estimate from what the provider reported (tokens,
--    billed seconds, sandbox time), usually a negative correction.
--
-- Access model, as for the other server-only tables (0001_init.sql):
-- * Row-level security is on, with no policies: no one but service_role (which
--   bypasses RLS) ever reads or writes a row.
-- * anon and authenticated have no privileges on the table and cannot execute
--   either function. Only server code with the service-role key reaches them,
--   so the amounts are never a value a browser sent.
--
-- The spend report (npm run spend, scripts/spend.mts) reads this table.

create table public.provider_spend (
  provider text not null check (provider in ('anthropic', 'openai', 'daytona')),
  -- The first day of the calendar month (UTC) the spend belongs to.
  month date not null check (extract(day from month) = 1),
  -- Estimated US dollars, from the providers' published prices
  -- (lib/providers/costs.ts), to a millionth of a dollar.
  spent_usd numeric(12, 6) not null default 0 check (spent_usd >= 0),
  -- Fallback calls that went ahead, and calls refused because the cap was reached.
  calls integer not null default 0 check (calls >= 0),
  refused integer not null default 0 check (refused >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider, month)
);

comment on table public.provider_spend is 'Estimated spend of each fallback API key per provider and month (UTC), for the app-enforced cap. Written only by server code.';

alter table public.provider_spend enable row level security;

-- Table privileges, set explicitly so they hold whether or not the project
-- exposes new tables to the Data API automatically.
revoke all on table public.provider_spend from anon, authenticated;
grant select, insert, update on table public.provider_spend to service_role;

-- ---------------------------------------------------------------------------
-- reserve_provider_spend: add a fallback call's estimated cost, within the cap
-- ---------------------------------------------------------------------------

-- Returns the new total when p_usd fits under p_cap_usd, or null when it does
-- not (the call must not be made; the refusal is counted). One statement, so
-- the check and the increment cannot be split by a concurrent call.
create function public.reserve_provider_spend(
  p_provider text,
  p_month date,
  p_usd numeric,
  p_cap_usd numeric
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total numeric;
begin
  if p_usd is null or p_usd < 0 then
    raise exception 'p_usd must be zero or more';
  end if;
  if p_cap_usd is null or p_cap_usd < 0 then
    raise exception 'p_cap_usd must be zero or more';
  end if;

  insert into public.provider_spend as s (provider, month, spent_usd, calls)
  select p_provider, p_month, p_usd, 1
  where p_usd <= p_cap_usd
  on conflict (provider, month) do update
    set spent_usd = s.spent_usd + excluded.spent_usd,
        calls = s.calls + 1,
        updated_at = now()
    where s.spent_usd + excluded.spent_usd <= p_cap_usd
  returning s.spent_usd into v_total;

  if v_total is null then
    insert into public.provider_spend as s (provider, month, refused)
    values (p_provider, p_month, 1)
    on conflict (provider, month) do update
      set refused = s.refused + 1,
          updated_at = now();
  end if;

  return v_total;
end;
$$;

comment on function public.reserve_provider_spend(text, date, numeric, numeric) is
  'Adds p_usd to the month''s fallback spend if the total stays within p_cap_usd; returns the new total, or null when refused. Server only (service_role).';

-- ---------------------------------------------------------------------------
-- settle_provider_spend: correct a reservation once the real usage is known
-- ---------------------------------------------------------------------------

-- p_delta_usd is the estimate from the provider's reported usage minus what
-- was reserved: negative when the call cost less than its upper bound, as it
-- nearly always does. Never takes the total below zero. Returns the new total.
create function public.settle_provider_spend(
  p_provider text,
  p_month date,
  p_delta_usd numeric
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total numeric;
begin
  if p_delta_usd is null then
    raise exception 'p_delta_usd must not be null';
  end if;

  insert into public.provider_spend as s (provider, month, spent_usd)
  values (p_provider, p_month, greatest(p_delta_usd, 0))
  on conflict (provider, month) do update
    set spent_usd = greatest(s.spent_usd + p_delta_usd, 0),
        updated_at = now()
  returning s.spent_usd into v_total;

  return v_total;
end;
$$;

comment on function public.settle_provider_spend(text, date, numeric) is
  'Corrects the month''s fallback spend by p_delta_usd (often negative), never below zero; returns the new total. Server only (service_role).';

-- New functions in public are executable by everyone by default.
revoke execute on function public.reserve_provider_spend(text, date, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.settle_provider_spend(text, date, numeric) from public, anon, authenticated;
grant execute on function public.reserve_provider_spend(text, date, numeric, numeric) to service_role;
grant execute on function public.settle_provider_spend(text, date, numeric) to service_role;
