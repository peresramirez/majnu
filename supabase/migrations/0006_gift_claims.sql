-- Majnu: claims on an invitation's gift list (issue #35, docs/plan.md "Gift
-- list on invitations", docs/features/gift-list.md).
--
-- A wedding or party invitation can carry a gift list (`wishlist` in the
-- letter's content, each item with a stable id). A guest taps "I'll bring
-- this" and POST /api/claim records one row here. The unique constraint on
-- (letter_id, item_id) is what makes a gift claimable once: when two guests
-- claim the same gift at the same moment, one insert wins and the other fails
-- with a unique violation (23505), which the route answers as "taken".
--
-- Access model, as for letter_events (0001_init.sql):
-- * Row-level security is on. Owners can read the claims on their own letters,
--   for the host view in My gifts, and nothing else. There is no anonymous
--   read: the public page reads the claimed item ids on the server with the
--   service-role key, by exact slug.
-- * Owners may read every column except visitor_id. The visitor hash is only
--   there to limit claims per visitor and tells the host nothing.
-- * Every write goes through server code with the service-role key: a guest's
--   claim through POST /api/claim, and a host's release through a server action
--   that first proves ownership with the host's own session (RLS).

create table public.gift_claims (
  id bigint generated always as identity primary key,
  letter_id uuid not null references public.letters (id) on delete cascade,
  -- The WishlistItem id in letters.content->'wishlist' (lib/letters/schema.ts).
  item_id text not null check (item_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  -- The optional first name a guest leaves for the host. Shown only to the host.
  guest_name text check (guest_name is null or char_length(guest_name) between 1 and 40),
  -- HMAC-SHA-256 of the letter id, IP address and user agent (lib/open/visitor.ts),
  -- the same hash /api/open uses. The IP address itself is never stored.
  visitor_id text not null check (visitor_id ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  -- One claim per gift. Because letter_id leads, this index also serves the
  -- lookups by letter (the public page, the host view, the per-visitor count)
  -- and the cascade from letters. A list has at most a dozen items, so the
  -- per-visitor count needs no index of its own.
  constraint gift_claims_once_per_item unique (letter_id, item_id)
);

comment on table public.gift_claims is 'Guests'' claims on an invitation''s gift list. Written only by server code with the service-role key.';

alter table public.gift_claims enable row level security;

create policy "Owners can read claims on their own letters"
  on public.gift_claims for select
  to authenticated
  using (
    exists (
      select 1 from public.letters l
      where l.id = gift_claims.letter_id
        and l.owner_id = (select auth.uid())
    )
  );

-- Supabase grants new tables to anon and authenticated by default. Revoke that,
-- then give owners a column grant that leaves visitor_id out, so it cannot be
-- read even on their own letters. No insert, update or delete for either role.
revoke all on table public.gift_claims from anon, authenticated;
grant select (id, letter_id, item_id, guest_name, created_at) on table public.gift_claims to authenticated;
grant select, insert, update, delete on table public.gift_claims to service_role;
grant usage, select on sequence public.gift_claims_id_seq to service_role;
