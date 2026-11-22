-- Majnu: the gift catalogue behind the finder's instant first answer (issue
-- #97; docs/features/gift-catalog.md).
--
-- Real gifts from real shops, collected and link-checked by hand, grouped by
-- who they suit. The finder's first answer picks six of them for the group a
-- first message names (lib/finder/catalog-match.ts) with no model call and no
-- live research; asking to personalise starts the research as before.
--
-- Access model, as for the other server-only tables (0001_init.sql,
-- 0010_provider_spend.sql):
-- * Row-level security is on, with no policies: no one but service_role (which
--   bypasses RLS) reads or writes a row. The finder reads the active rows on
--   the server (lib/finder/catalog.ts) and sends visitors only the six it
--   picked, as options.
-- * anon and authenticated have no privileges on the table.
-- * Rows are written only by `npm run catalog:import -- <file>`
--   (scripts/catalog-import.mjs), with the service-role key, upserted by id.
--   Later the links can carry referral codes; the import replaces them.

create table public.gift_catalog (
  -- Stable, chosen by whoever collected the gift (e.g. "mother-kindle-paperwhite").
  id text primary key check (char_length(id) between 1 and 120),
  -- Who it suits: mother, father, partner, best_friend, sibling, grandparent,
  -- colleague, child_teen, general. At least one.
  groups text[] not null check (cardinality(groups) > 0),
  -- e.g. birthday, christmas, anniversary; empty when it suits any occasion.
  occasions text[] not null default '{}',
  -- e.g. reading, gardening, cooking; matched against the visitor's words.
  interests text[] not null default '{}',
  title text not null check (char_length(title) between 1 and 200),
  description text,
  -- Why it suits the person, shown under the recommended card.
  why text,
  shop text,
  -- The display price as the shop shows it, e.g. "39,90 €".
  price text,
  -- The same in euros, for budgets.
  price_eur numeric(10, 2) check (price_eur is null or price_eur >= 0),
  -- The product page; https only, as every finder option.
  url text not null check (url ~* '^https://'),
  image_url text check (image_url is null or image_url ~* '^https://'),
  -- When the link was last checked to work.
  checked_at timestamptz,
  -- Off when a gift is sold out or its link broke; the finder skips it.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.gift_catalog is 'Gifts the finder shows at once for a first message, by who they suit (issue #97). Read and written only by server code with the service role.';

-- The finder reads the active rows for a group: a GIN index on groups for
-- `groups @> '{mother}'`, limited to active rows. (Today the server reads all
-- active rows into memory every few minutes; the index keeps a per-group read
-- cheap when the catalogue grows.)
create index gift_catalog_groups_idx on public.gift_catalog using gin (groups) where active;
create index gift_catalog_occasions_idx on public.gift_catalog using gin (occasions) where active;

create trigger gift_catalog_set_updated_at
  before update on public.gift_catalog
  for each row execute function public.set_updated_at();

alter table public.gift_catalog enable row level security;

-- Table privileges, set explicitly so they hold whether or not the project
-- exposes new tables to the Data API automatically.
revoke all on table public.gift_catalog from anon, authenticated;
grant select, insert, update, delete on table public.gift_catalog to service_role;
