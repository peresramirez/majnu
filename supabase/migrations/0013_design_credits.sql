-- Majnu: personalisations bought in advance (issue #96,
-- docs/features/billing.md, "Personalisations bought in advance").
--
-- On the Purchases tab a signed-in member can buy one to five
-- personalisations at once (N x the €2.99 wrapper price, one Stripe-hosted
-- Checkout in payment mode, not tied to a gift). "Make it unique" then uses
-- one without going to Stripe.
--
-- How the balance is kept: there is no counter to drift. The balance is
-- what was bought (credit_grants.quantity - refunded_quantity) minus the
-- purchases paid with a credit that did not fail. A failed design therefore
-- gives its credit back by itself, the moment its purchase is marked failed.
--
-- Granting: one row per paid top-up, keyed by the Checkout Session id
-- (unique). grant_design_credits() inserts it with "on conflict do nothing",
-- so the webhook, its retries and the return page can all call it and the
-- credits are granted once.
--
-- Using one: claim_design_credit() in one transaction takes a per-owner
-- transaction lock (pg_advisory_xact_lock), checks the letter, refuses when a
-- design for it is already on its way, counts the balance and, when one is
-- left, records the purchase as paid with amount 0 and paid_with_credit.
-- Two claims at once for the same owner queue on the lock; the second counts
-- after the first has committed (each statement in plpgsql takes a fresh
-- snapshot under read committed), sees its purchase and, with a balance of 1,
-- gets 'none_left'.
--
-- A design run that fails for a credit purchase never goes to Stripe: the job
-- calls return_design_credit(), which marks the purchase failed, once
-- (lib/billing/refunds.ts). The balance counts it again from then on.
--
-- Refunds: unused personalisations can be refunded within 14 days of buying
-- (lib/plans.ts). That is done by hand: refund in Stripe, then raise
-- refunded_quantity on the grant, which lowers the balance.
--
-- Access model, as for purchases:
-- * credit_grants: row-level security on. Owners may read their own rows,
--   through a column grant (the Purchases tab lists each top-up with its
--   receipt). No insert, update or delete for anon or authenticated.
-- * The four functions can be executed by service_role only.
-- * purchases: owners may read the new paid_with_credit column of their own
--   rows, so the Purchases tab can say "Used 1 personalisation".

-- ---------------------------------------------------------------------------
-- credit_grants: one row per paid top-up
-- ---------------------------------------------------------------------------

create table public.credit_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- How many personalisations this payment bought (the Checkout's quantity).
  quantity integer not null check (quantity between 1 and 20),
  -- Personalisations refunded by hand (unused ones, within 14 days).
  refunded_quantity integer not null default 0,
  -- What Checkout charged, in the smallest unit, VAT included.
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  -- The payment, once: the webhook and the return page both insert with this
  -- key, so whichever comes second changes nothing.
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text unique,
  -- Stripe's hosted receipt, shown on the Purchases tab.
  receipt_url text check (receipt_url is null or receipt_url ~ '^https://'),
  created_at timestamptz not null default now(),
  constraint credit_grants_refunded_within_quantity check (refunded_quantity between 0 and quantity)
);

comment on table public.credit_grants is
  'Personalisations bought in advance: one row per paid top-up Checkout. Written only by server code with the service-role key.';

-- The Purchases tab lists a user's top-ups, newest first; the balance sums
-- them; the RLS policy filters on owner_id; the cascade from auth.users.
create index credit_grants_owner_id_created_at_idx on public.credit_grants (owner_id, created_at desc);

alter table public.credit_grants enable row level security;

create policy "Owners can read their own credit grants"
  on public.credit_grants for select
  to authenticated
  using (owner_id = (select auth.uid()));

-- Supabase grants new tables to anon and authenticated by default. Revoke
-- that, then give owners what the Purchases tab shows. The Stripe ids stay
-- with the server.
revoke all on table public.credit_grants from anon, authenticated;
grant select (id, owner_id, quantity, refunded_quantity, amount_cents, currency, receipt_url, created_at)
  on table public.credit_grants to authenticated;
grant select, insert, update, delete on table public.credit_grants to service_role;

-- ---------------------------------------------------------------------------
-- purchases: a purchase can be paid with a personalisation bought in advance
-- ---------------------------------------------------------------------------

-- A constant default: a catalogue-only change, no table rewrite.
alter table public.purchases
  add column paid_with_credit boolean not null default false;

comment on column public.purchases.paid_with_credit is
  'Paid with a personalisation bought in advance (credit_grants). Amount 0, no Stripe ids, consent still recorded. Counts against the balance unless it failed.';

-- As 0011 and 0012 did for coupon and free purchases:
-- * amount_cents: only a card purchase costs more than 0.
-- * consent: still required for a credit purchase (purchases_consent_unless_free
--   from 0012 does not exempt it). The right of withdrawal for that one
--   personalisation ends when its design starts.
-- * A credit purchase never has Stripe ids or a receipt (the top-up has the
--   receipt), so the refund code can never send one to Stripe.
-- * It is not also a coupon or a free purchase.
alter table public.purchases
  drop constraint purchases_amount_cents_check,
  add constraint purchases_amount_cents_check check (
    (coupon_id is null and free_day is null and not paid_with_credit and amount_cents > 0)
    or ((coupon_id is not null or free_day is not null or paid_with_credit) and amount_cents = 0)
  ),
  add constraint purchases_credit_has_no_stripe check (
    not paid_with_credit
    or (stripe_checkout_session_id is null and stripe_payment_intent_id is null and stripe_refund_id is null and receipt_url is null)
  ),
  add constraint purchases_credit_is_alone check (not paid_with_credit or (coupon_id is null and free_day is null));

-- The balance counts an owner's credit purchases. Partial, so it holds only
-- those rows.
create index purchases_credit_owner_id_idx on public.purchases (owner_id) where paid_with_credit;

grant select (paid_with_credit) on table public.purchases to authenticated;

-- ---------------------------------------------------------------------------
-- design_credits_balance: "Yours: N"
-- ---------------------------------------------------------------------------

create function public.design_credits_balance(p_owner_id uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select (
    coalesce((select sum(g.quantity - g.refunded_quantity) from public.credit_grants g where g.owner_id = p_owner_id), 0)
    - (select count(*) from public.purchases p where p.owner_id = p_owner_id and p.paid_with_credit and p.status <> 'failed')
  )::integer;
$$;

comment on function public.design_credits_balance(uuid) is
  'Personalisations an owner has left: bought minus refunded minus used by designs that did not fail. Server only (service_role).';

-- ---------------------------------------------------------------------------
-- grant_design_credits: a paid top-up, once per Checkout Session
-- ---------------------------------------------------------------------------

-- Outcomes: 'granted' (this call inserted the row) or 'already_granted' (an
-- earlier call did; nothing changes). balance is the owner's balance after.
create function public.grant_design_credits(
  p_owner_id uuid,
  p_quantity integer,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_amount_cents integer,
  p_currency text,
  p_receipt_url text
)
returns table (outcome text, grant_id uuid, balance integer)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_grant_id uuid;
begin
  if p_owner_id is null or p_quantity is null or p_checkout_session_id is null or p_amount_cents is null or p_currency is null then
    raise exception 'grant_design_credits: owner, quantity, session, amount and currency are required';
  end if;

  insert into public.credit_grants (owner_id, quantity, amount_cents, currency, stripe_checkout_session_id, stripe_payment_intent_id, receipt_url)
    values (p_owner_id, p_quantity, p_amount_cents, lower(p_currency), p_checkout_session_id, p_payment_intent_id, p_receipt_url)
    on conflict (stripe_checkout_session_id) do nothing
    returning id into v_grant_id;

  if v_grant_id is null then
    select g.id into v_grant_id from public.credit_grants g where g.stripe_checkout_session_id = p_checkout_session_id;
    return query select 'already_granted'::text, v_grant_id, public.design_credits_balance(p_owner_id);
    return;
  end if;
  return query select 'granted'::text, v_grant_id, public.design_credits_balance(p_owner_id);
end;
$$;

comment on function public.grant_design_credits(uuid, integer, text, text, integer, text, text) is
  'Records a paid top-up once per Checkout Session (idempotent under webhook retries). Server only (service_role).';

-- ---------------------------------------------------------------------------
-- claim_design_credit: use one personalisation for a letter
-- ---------------------------------------------------------------------------

-- Outcomes:
--   claimed           one credit used; purchase_id is the new paid purchase
--   none_left         the balance is 0
--   in_progress       a design for this letter is already paid or designing
--   letter_not_found  the letter is not this owner's built letter (server code
--                     checks this first through row-level security; this is
--                     the backstop)
-- balance is what is left after this call (null for in_progress and
-- letter_not_found). Nothing is changed unless the outcome is 'claimed'.
create function public.claim_design_credit(
  p_owner_id uuid,
  p_letter_id uuid,
  p_request text,
  p_consent_text text
)
returns table (outcome text, purchase_id uuid, balance integer)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_balance integer;
  v_purchase_id uuid;
begin
  if p_owner_id is null or p_letter_id is null or p_request is null or p_consent_text is null then
    raise exception 'claim_design_credit: every argument is required';
  end if;

  -- One claim per owner at a time, until this transaction ends. The key is
  -- the owner id hashed into the 64-bit advisory lock space, prefixed so it
  -- cannot collide with another feature's lock on the same id.
  perform pg_advisory_xact_lock(hashtextextended('design_credits:' || p_owner_id::text, 0));

  if not exists (
    select 1 from public.letters l
    where l.id = p_letter_id and l.owner_id = p_owner_id and l.kind = 'letter' and jsonb_typeof(l.content) = 'object'
  ) then
    return query select 'letter_not_found'::text, null::uuid, null::integer;
    return;
  end if;

  if exists (
    select 1 from public.purchases p where p.letter_id = p_letter_id and p.status in ('paid', 'designing')
  ) then
    return query select 'in_progress'::text, null::uuid, null::integer;
    return;
  end if;

  -- After the lock, so it sees every claim that committed before this one.
  v_balance := public.design_credits_balance(p_owner_id);
  if v_balance < 1 then
    return query select 'none_left'::text, null::uuid, greatest(v_balance, 0);
    return;
  end if;

  begin
    insert into public.purchases (owner_id, letter_id, status, request, consent_at, consent_text, amount_cents, currency, paid_with_credit, paid_at)
      values (p_owner_id, p_letter_id, 'paid', p_request, now(), p_consent_text, 0, 'eur', true, now())
      returning id into v_purchase_id;
  exception when unique_violation then
    -- A concurrent purchase of the same letter became paid first
    -- (purchases_one_run_per_letter_idx). Nothing was used.
    return query select 'in_progress'::text, null::uuid, null::integer;
    return;
  end;

  return query select 'claimed'::text, v_purchase_id, v_balance - 1;
end;
$$;

comment on function public.claim_design_credit(uuid, uuid, text, text) is
  'Uses one personalisation bought in advance and records a paid purchase (amount 0) for the letter, in one transaction, one claim per owner at a time. Server only (service_role).';

-- ---------------------------------------------------------------------------
-- return_design_credit: a credit purchase's design could not be made
-- ---------------------------------------------------------------------------

-- Marks the purchase failed, once: a second call finds it failed already and
-- changes nothing. A failed credit purchase no longer counts against the
-- balance, so this is the give-back. Returns true when it was marked here.
create function public.return_design_credit(p_purchase_id uuid, p_reason text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.purchases p
    set status = 'failed',
        finished_at = now(),
        failure_reason = left(coalesce(p_reason, 'The design could not be made'), 1000)
    where p.id = p_purchase_id
      and p.paid_with_credit
      and p.status in ('paid', 'designing');
  return found;
end;
$$;

comment on function public.return_design_credit(uuid, text) is
  'Marks a credit purchase failed, which gives its personalisation back, once. Server only (service_role).';

-- New functions in public are executable by everyone by default.
revoke execute on function public.design_credits_balance(uuid) from public, anon, authenticated;
revoke execute on function public.grant_design_credits(uuid, integer, text, text, integer, text, text) from public, anon, authenticated;
revoke execute on function public.claim_design_credit(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.return_design_credit(uuid, text) from public, anon, authenticated;
grant execute on function public.design_credits_balance(uuid) to service_role;
grant execute on function public.grant_design_credits(uuid, integer, text, text, integer, text, text) to service_role;
grant execute on function public.claim_design_credit(uuid, uuid, text, text) to service_role;
grant execute on function public.return_design_credit(uuid, text) to service_role;
