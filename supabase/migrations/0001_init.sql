-- Majnu: letters, profiles and open tracking.
--
-- Access model (docs/plan.md, "Security rules"):
-- * Row-level security is on for every table. There are no policies and no
--   grants for `anon`: nothing here is readable without signing in.
-- * Public letter pages, /api/open and plan changes go through server code
--   with the service-role key (lib/supabase/admin.ts), which bypasses RLS.
-- * Signed-in users can read their own letters, events and profile, and can
--   change only the content columns of their own letters. `slug`, `owner_id`,
--   `chat` and everything in `profiles` are written by server code only.
--
-- Written to run once on a fresh project.

-- ---------------------------------------------------------------------------
-- letters
-- ---------------------------------------------------------------------------

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[A-Za-z0-9_-]{6,64}$'),
  kind text not null default 'letter' check (kind in ('letter', 'calendar')),
  template_id text,
  title text check (char_length(title) <= 200),
  -- The builder's output, validated against lib/letters/schema.ts before it is
  -- written. The size cap bounds what a user can store by writing the column
  -- directly, since the content is fed back to the model on edits.
  content jsonb check (
    content is null or (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 200000)
  ),
  -- The conversation exactly as the Anthropic API returned it.
  chat jsonb not null default '[]'::jsonb check (jsonb_typeof(chat) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.letters is 'One gift, letter, invitation or calendar. Public pages read it by exact slug with the service-role key.';

-- The dashboard lists a user's letters newest first, and the spending guard
-- counts letters per user per day and per month.
create index letters_owner_id_created_at_idx on public.letters (owner_id, created_at desc);

alter table public.letters enable row level security;

create policy "Owners can read their own letters"
  on public.letters for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can update their own letters"
  on public.letters for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- No insert or delete policy: createLetter() checks the session and inserts
-- with the service-role client, so the slug and owner always come from the server.

-- Table privileges, set explicitly so they hold whether or not the project
-- exposes new tables to the Data API automatically. A table-level UPDATE grant
-- would cover every column, so it is revoked before the column grant.
-- `chat` is left out of the column grant on purpose: the spending guard counts
-- chat turns from it, and a browser that could rewrite it could reset that
-- count or replay a huge forged history at our expense. saveChat() writes it
-- with the service-role client after an ownership check through RLS.
revoke all on table public.letters from anon, authenticated;
grant select on table public.letters to authenticated;
grant update (kind, template_id, title, content, updated_at) on table public.letters to authenticated;
grant select, insert, update, delete on table public.letters to service_role;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'full-moon')),
  stripe_customer_id text unique,
  stripe_subscription_id text,
  plan_renews_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per user. The plan is written only by server code (checkout return and the Stripe webhook).';

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- letter_events
-- ---------------------------------------------------------------------------

-- visitor_id is a keyed SHA-256 hash of the letter id, IP address and user
-- agent (lib/open/visitor.ts). The IP address itself is never stored.
create table public.letter_events (
  id bigint generated always as identity primary key,
  letter_id uuid not null references public.letters (id) on delete cascade,
  type text not null check (type in ('open', 'door_open', 'gift_click')),
  -- The calendar door number for door_open and gift_click on a calendar; 0 otherwise.
  day int not null default 0 check (day between 0 and 366),
  visitor_id text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  -- Repeat visits do not inflate counts. Because letter_id leads, this index
  -- also serves lookups by letter and the cascade from letters, so letter_id
  -- needs no index of its own.
  constraint letter_events_once_per_visitor unique (letter_id, type, day, visitor_id)
);

comment on table public.letter_events is 'Opens, door opens and gift clicks, recorded by POST /api/open with the service-role key.';

alter table public.letter_events enable row level security;

create policy "Owners can read events of their own letters"
  on public.letter_events for select
  to authenticated
  using (
    exists (
      select 1 from public.letters l
      where l.id = letter_events.letter_id
        and l.owner_id = (select auth.uid())
    )
  );

revoke all on table public.letter_events from anon, authenticated;
grant select on table public.letter_events to authenticated;
grant select, insert, update, delete on table public.letter_events to service_role;
grant usage, select on sequence public.letter_events_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- letter_summaries: the dashboard list with open statistics in one query
-- ---------------------------------------------------------------------------

-- security_invoker makes the view run with the caller's privileges, so the
-- RLS policies above decide which rows a signed-in user sees.
create view public.letter_summaries
with (security_invoker = true)
as
select
  l.id,
  l.owner_id,
  l.slug,
  l.kind,
  l.template_id,
  l.title,
  l.content ->> 'recipientName' as recipient_name,
  l.content is not null as has_content,
  l.created_at,
  l.updated_at,
  s.first_opened_at,
  s.last_opened_at,
  coalesce(s.total_opens, 0) as total_opens,
  coalesce(s.unique_visitors, 0) as unique_visitors
from public.letters l
left join lateral (
  select
    min(e.created_at) as first_opened_at,
    max(e.created_at) as last_opened_at,
    count(*) filter (where e.type = 'open') as total_opens,
    count(distinct e.visitor_id) as unique_visitors
  from public.letter_events e
  where e.letter_id = l.id
) s on true;

revoke all on table public.letter_summaries from anon, authenticated;
grant select on table public.letter_summaries to authenticated;
grant select on table public.letter_summaries to service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

create trigger letters_set_updated_at
  before update on public.letters
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- A profile row for every new user, so the plan check always finds one.
-- security definer because the auth service inserts users as its own role,
-- which cannot write to public.profiles. Execute is revoked from the API roles;
-- the trigger still fires, since privileges are checked when it is created.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users who signed up before this migration.
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;
