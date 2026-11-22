-- Majnu: where, in which language and on which device a gift was opened
-- (issue #49, the Tracker tab; docs/features/sharing-and-tracking.md).
--
-- POST /api/open now also records, for each event:
-- * country: ISO 3166-1 alpha-2 code from Cloudflare's request data
--   (request.cf.country, or the CF-IPCountry header), for example 'DE';
-- * city: Cloudflare's city name for the network, for example 'Berlin'.
--   Nothing finer: no IP address, region code, postal code or coordinates;
-- * language: the primary subtag of the browser's Accept-Language, for example 'de';
-- * device: 'phone', 'tablet' or 'desktop', derived from the user agent.
-- Every column is nullable: rows recorded before this migration, local
-- development and visitors whose network has no known place simply have none.
--
-- Access model, as before (0001_init.sql): row-level security decides which
-- rows an owner reads (only their own letters' events), and only server code
-- with the service-role key writes. What changes is which columns owners read.
-- Until now they had a table-wide SELECT grant, which included visitor_id (the
-- HMAC visitor hash) and the raw user agent. The Tracker tab needs neither, so
-- owners now get a column grant without them, as on gift_claims (0006).
--
-- letter_summaries is security_invoker, and its unique_visitors column counts
-- distinct visitor_ids, which the caller can no longer read. The count moves
-- into private.letter_unique_visitors(), a security definer function in a
-- schema the Data API does not expose. It answers only for letters the caller
-- owns (auth.uid()) and returns a number, never a hash. The view keeps its
-- columns, names and types, so My gifts and listMyLetters() are unchanged.

-- ---------------------------------------------------------------------------
-- New columns on letter_events
-- ---------------------------------------------------------------------------

alter table public.letter_events
  add column country text,
  add column city text,
  add column language text,
  add column device text,
  add constraint letter_events_country_format check (country is null or country ~ '^[A-Z]{2}$'),
  add constraint letter_events_city_format check (
    city is null or (char_length(city) between 1 and 80 and city = btrim(city) and city !~ '[[:cntrl:]]')
  ),
  add constraint letter_events_language_format check (language is null or language ~ '^[a-z]{2,3}$'),
  add constraint letter_events_device_value check (device is null or device in ('phone', 'tablet', 'desktop'));

comment on column public.letter_events.country is 'ISO 3166-1 alpha-2 country of the network the event came from (Cloudflare). Null when unknown.';
comment on column public.letter_events.city is 'City of the network the event came from (Cloudflare). Never anything finer. Null when unknown.';
comment on column public.letter_events.language is 'Primary language subtag of the browser''s Accept-Language, for example de. Null when absent.';
comment on column public.letter_events.device is 'phone, tablet or desktop, derived from the user agent on the server. Null when unknown.';

-- ---------------------------------------------------------------------------
-- What owners may read
-- ---------------------------------------------------------------------------

-- The RLS policy "Owners can read events of their own letters" stays as it is.
-- Only the grant changes: every column except visitor_id and user_agent.
revoke select on table public.letter_events from authenticated;
grant select (id, letter_id, type, day, country, city, language, device, created_at)
  on table public.letter_events to authenticated;

-- ---------------------------------------------------------------------------
-- private.letter_unique_visitors: the visitor count without the hashes
-- ---------------------------------------------------------------------------

-- `private` is not in the Data API's exposed schemas, so nothing in it can be
-- called through PostgREST or GraphQL. Functions get EXECUTE for PUBLIC by
-- default; that default is removed for this schema, so every function in it
-- has to be granted on purpose.
create schema if not exists private;
revoke all on schema private from public;
alter default privileges in schema private revoke execute on functions from public;
grant usage on schema private to authenticated, service_role;

-- security definer because the caller cannot read visitor_id. The owner check
-- in the body replaces row-level security: for a letter the caller does not
-- own, or with no signed-in user, the answer is 0.
create function private.letter_unique_visitors(target_letter_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct e.visitor_id)
  from public.letter_events e
  where e.letter_id = target_letter_id
    and exists (
      select 1
      from public.letters l
      where l.id = target_letter_id
        and l.owner_id = (select auth.uid())
    )
$$;

comment on function private.letter_unique_visitors(uuid) is 'Distinct visitors of one letter, for its owner only. Used by letter_summaries.';

revoke execute on function private.letter_unique_visitors(uuid) from public, anon;
grant execute on function private.letter_unique_visitors(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- letter_summaries: same columns, unique_visitors from the function
-- ---------------------------------------------------------------------------

-- create or replace keeps the view's grants. Every column keeps its name, type
-- and position; unique_visitors is still a bigint.
create or replace view public.letter_summaries
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
  private.letter_unique_visitors(l.id) as unique_visitors
from public.letters l
left join lateral (
  select
    min(e.created_at) as first_opened_at,
    max(e.created_at) as last_opened_at,
    count(*) filter (where e.type = 'open') as total_opens
  from public.letter_events e
  where e.letter_id = l.id
) s on true;
