-- Majnu: the gift finder (issue #31, docs/plan.md "Gift finder").
--
-- finder_sessions holds one finder conversation: what Majnu assumed about the
-- recipient and where the visitor is (country and region only, never an
-- address or exact location), the model conversation exactly as the Anthropic
-- API returned it, and the last options shown, so a chosen option can be
-- wrapped later.
--
-- finder_searches has one row per gift search, for the daily limits: 3 plain
-- and 2 personalised searches per user per UTC day, and a site-wide daily cap
-- (MAJNU_DAILY_SEARCH_CAP). lib/finder/limits.ts inserts a row before a search
-- runs, then counts; a search over a limit deletes its own row again.
--
-- Access model, as for letters (0001_init.sql):
-- * Row-level security is on. Signed-in users, anonymous ones included (they
--   have the authenticated role), can read their own rows and nothing else.
-- * Every write goes through server code with the service-role key, after the
--   session has proved who the user is: the conversation is replayed to the
--   model and the searches are what the limits count, so the browser must not
--   be able to change either.

-- ---------------------------------------------------------------------------
-- finder_sessions
-- ---------------------------------------------------------------------------

create table public.finder_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- FinderContext from lib/finder/events.ts: country, region, language,
  -- currency and the assumptions about the recipient.
  context jsonb not null default '{}'::jsonb check (
    jsonb_typeof(context) = 'object' and octet_length(context::text) <= 20000
  ),
  -- The visitor's IANA timezone from the browser, for dates in a wrapped gift.
  timezone text check (char_length(timezone) <= 64),
  -- The conversation exactly as the Anthropic API returned it, replayed append-only.
  chat jsonb not null default '[]'::jsonb check (jsonb_typeof(chat) = 'array'),
  -- The last `options` event: { options, recommendedId, why }. Null until the first search.
  last_options jsonb check (last_options is null or jsonb_typeof(last_options) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.finder_sessions is 'One gift finder conversation. Written only by server code with the service-role key.';

-- Serves the RLS owner check, the cascade from auth.users and the count of a
-- user's sessions per day.
create index finder_sessions_owner_id_created_at_idx on public.finder_sessions (owner_id, created_at desc);

alter table public.finder_sessions enable row level security;

create policy "Owners can read their own finder sessions"
  on public.finder_sessions for select
  to authenticated
  using ((select auth.uid()) = owner_id);

revoke all on table public.finder_sessions from anon, authenticated;
grant select on table public.finder_sessions to authenticated;
grant select, insert, update, delete on table public.finder_sessions to service_role;

create trigger finder_sessions_set_updated_at
  before update on public.finder_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- finder_searches
-- ---------------------------------------------------------------------------

create table public.finder_searches (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- Set null rather than cascade, so removing a session does not hand back
  -- that day's searches.
  session_id uuid references public.finder_sessions (id) on delete set null,
  -- A search after the first one in the same session, usually after the
  -- personalising questions.
  personalised boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.finder_searches is 'One row per gift search, counted for the daily limits. Written only by server code.';

-- The per-user daily counts (and the RLS owner check, and the cascade from auth.users).
create index finder_searches_owner_id_created_at_idx on public.finder_searches (owner_id, created_at);
-- The site-wide daily cap counts every search since midnight UTC.
create index finder_searches_created_at_idx on public.finder_searches (created_at);
-- The foreign key, so deleting a session does not scan the table.
create index finder_searches_session_id_idx on public.finder_searches (session_id);

alter table public.finder_searches enable row level security;

create policy "Owners can read their own finder searches"
  on public.finder_searches for select
  to authenticated
  using ((select auth.uid()) = owner_id);

revoke all on table public.finder_searches from anon, authenticated;
grant select on table public.finder_searches to authenticated;
grant select, insert, update, delete on table public.finder_searches to service_role;
grant usage, select on sequence public.finder_searches_id_seq to service_role;
