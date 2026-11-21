-- Majnu: counting voice transcriptions for the daily limits (issue #37).
--
-- POST /api/transcribe turns a short recording into text with OpenAI's
-- transcription endpoint (docs/features/voice-input.md). Every call costs
-- money, so each one is counted here against a per-user daily limit and a
-- site-wide daily cap. A row holds who, how many seconds and when: never the
-- audio and never the text, which are not stored anywhere.
--
-- Access model, as for the other tables (0001_init.sql):
-- * Row-level security is on. There are no policies and no grants for `anon`.
-- * Signed-in users (anonymous accounts included) can read their own rows.
-- * Rows are written only by server code with the service-role key
--   (lib/voice/usage.ts). A browser that could delete its rows could reset
--   its own limit, so `authenticated` has no insert, update or delete.
-- * claim_voice_transcription() checks the limits and inserts in one step. It
--   can be executed only by service_role.
--
-- Rows older than seven days are deleted on the next claim: the limits only
-- ever look at today (UTC), so older rows have no use.

create table public.voice_transcriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Seconds of audio. Set from the length the browser reported when the call
  -- is claimed, then replaced by the length OpenAI billed. The cap is far
  -- above the 60-second recording limit so that a billed value always fits.
  seconds numeric(7, 2) not null default 0 check (seconds >= 0 and seconds <= 7200),
  created_at timestamptz not null default now()
);

comment on table public.voice_transcriptions is 'One row per voice transcription, for the daily limits. No audio, no text. Written only by server code.';

-- The per-user count (and the RLS policy) look rows up by user and day.
create index voice_transcriptions_user_id_created_at_idx on public.voice_transcriptions (user_id, created_at desc);
-- The site-wide count and the clean-up look rows up by time alone.
create index voice_transcriptions_created_at_idx on public.voice_transcriptions (created_at);

alter table public.voice_transcriptions enable row level security;

create policy "Users can read their own voice transcriptions"
  on public.voice_transcriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Table privileges, set explicitly so they hold whether or not the project
-- exposes new tables to the Data API automatically.
revoke all on table public.voice_transcriptions from anon, authenticated;
grant select on table public.voice_transcriptions to authenticated;
grant select, insert, update, delete on table public.voice_transcriptions to service_role;

-- ---------------------------------------------------------------------------
-- claim_voice_transcription: check today's limits and reserve one call
-- ---------------------------------------------------------------------------

-- Returns one row: the new row's id when the call may go ahead, or a refusal:
--   'user_count'   the user has made p_max_per_user calls today (UTC)
--   'user_seconds' the user's calls today add up to p_max_seconds_per_user
--   'site_cap'     everyone's calls today add up to p_max_per_site
-- The limits are parameters so they live in one place (lib/voice/rules.ts);
-- only service_role can call this, so they are never a value a browser sent.
--
-- The seconds check refuses only once the total is already reached, so the
-- last recording of the day may go a little over instead of being thrown away
-- after it was made.
--
-- A transaction-level advisory lock per user makes concurrent claims by one
-- user run one after the other, so a burst of parallel requests cannot all
-- pass the count. The site-wide count is not locked: under a burst from many
-- users it can go over by a few calls, which the cap allows for.
create function public.claim_voice_transcription(
  p_user_id uuid,
  p_seconds numeric,
  p_max_per_user integer,
  p_max_seconds_per_user integer,
  p_max_per_site integer
)
returns table (claim_id uuid, refusal text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_day_start timestamptz := date_trunc('day', now(), 'UTC');
  v_count integer;
  v_seconds numeric;
  v_site integer;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('voice_transcriptions:' || p_user_id::text, 0));

  delete from public.voice_transcriptions t
  where t.created_at < v_day_start - interval '7 days';

  select count(*), coalesce(sum(t.seconds), 0)
    into v_count, v_seconds
  from public.voice_transcriptions t
  where t.user_id = p_user_id
    and t.created_at >= v_day_start;

  if v_count >= p_max_per_user then
    return query select null::uuid, 'user_count'::text;
    return;
  end if;

  if v_seconds >= p_max_seconds_per_user then
    return query select null::uuid, 'user_seconds'::text;
    return;
  end if;

  select count(*)
    into v_site
  from public.voice_transcriptions t
  where t.created_at >= v_day_start;

  if v_site >= p_max_per_site then
    return query select null::uuid, 'site_cap'::text;
    return;
  end if;

  insert into public.voice_transcriptions (user_id, seconds)
  values (p_user_id, least(greatest(p_seconds, 0), 7200))
  returning id into v_id;

  return query select v_id, null::text;
end;
$$;

comment on function public.claim_voice_transcription(uuid, numeric, integer, integer, integer) is
  'Checks the voice limits for today (UTC) and inserts a row when the call may go ahead. Server only (service_role).';

-- New functions in public are executable by everyone by default.
revoke execute on function public.claim_voice_transcription(uuid, numeric, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_voice_transcription(uuid, numeric, integer, integer, integer) to service_role;
