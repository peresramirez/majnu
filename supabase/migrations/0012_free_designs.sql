-- Majnu: three free personalised wrappers per IP address per UTC day
-- (issue #85, docs/features/free-designs.md).
--
-- While Google's branding verification is pending, everyone (guests and
-- members) may have the €2.99 personalised wrapper made for free, three times
-- a day for each internet connection. No account, no payment and no consent
-- box: nothing is paid. Coupon codes (0011_coupons.sql) and Stripe work as
-- before once the day's free designs are used.
--
-- How an IP address is counted without being kept: server code computes
-- HMAC-SHA-256 under OPEN_HASH_SECRET of "free-designs:<UTC day>:<address>"
-- (an IPv6 address cut to its /64 network; lib/billing/free-designs.ts) and
-- sends only that. Without the secret the hash cannot be turned back into an
-- address, and because the day is inside the hash, the same address gives an
-- unrelated value every day, so nothing links one day to the next. The
-- address itself is never sent to the database or written to a log.
--
-- Nothing older than yesterday is kept: every call of claim_free_design() and
-- free_designs_left() first deletes counter rows older than yesterday (UTC)
-- and clears the hash from purchases of those days. A purchase carries the
-- hash only while its design is on its way, so a failed run can give the use
-- back to the right counter; it is cleared when the purchase is done or
-- failed, and by that sweep at the latest.
--
-- Claiming is one call to claim_free_design(), one transaction: it checks the
-- letter, refuses when a design for it is already on its way, takes one of
-- the day's uses with a conditional upsert (used < limit), and records the
-- purchase as paid with amount 0 and free_day. Four claims at once from one
-- address reach the same counter row; each waits for the one before it,
-- re-checks used < limit against the row it left, and the fourth finds none
-- left and gets 'used_up'. Server code then hands the purchase to the design
-- queue exactly as a paid one.
--
-- A design run that fails for a free purchase never goes to Stripe: the job
-- calls return_free_design(), which marks the purchase failed and gives the
-- day's use back, once (lib/billing/refunds.ts).
--
-- Lock order, to rule out deadlocks between a sweep and a give-back: every
-- function here locks purchase rows before counter rows, and a give-back
-- never touches a counter older than yesterday (the one a sweep deletes).
--
-- Access model, as for coupons:
-- * free_design_days: row-level security on, no policies, no privileges for
--   anon or authenticated. Only service_role reads or writes it.
-- * The three functions can be executed by service_role only.
-- * purchases: owners may read the new free_day column of their own rows, so
--   the Purchases tab can say "Free". free_ip_hash is not granted to them.

-- ---------------------------------------------------------------------------
-- free_design_days: the day's uses for each hashed address
-- ---------------------------------------------------------------------------

create table public.free_design_days (
  -- The UTC day the uses belong to. First in the key, so the same index
  -- serves the lookup (day and hash) and the sweep (day older than yesterday).
  day date not null,
  -- HMAC-SHA-256 (lower-case hex) of the day and the address, under a server
  -- secret. Never the address.
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  used integer not null default 0 check (used >= 0),
  primary key (day, ip_hash)
);

comment on table public.free_design_days is
  'Free personalised wrappers used per keyed, daily hash of an IP address. Rows older than yesterday (UTC) are deleted as new ones are counted. Service role only.';

alter table public.free_design_days enable row level security;

-- Supabase grants new tables to anon and authenticated by default. Revoke
-- that; only the service role works with the counts.
revoke all on table public.free_design_days from anon, authenticated;
grant select, insert, update, delete on table public.free_design_days to service_role;

-- ---------------------------------------------------------------------------
-- purchases: a purchase can be one of the day's free designs
-- ---------------------------------------------------------------------------

-- Nullable columns without a default: a catalogue-only change, every existing
-- row is null.
alter table public.purchases
  add column free_day date,
  add column free_ip_hash text;

comment on column public.purchases.free_day is
  'The UTC day whose free design paid for this wrapper, or null when Stripe or a coupon did. A free purchase has amount 0, no consent and no Stripe ids.';
comment on column public.purchases.free_ip_hash is
  'The counter (free_design_days.ip_hash) a failed run gives the use back to. Kept only while the design is on its way; cleared when it is done or failed, and after a day at the latest. Not readable by owners.';

-- Relax only what a free purchase needs, and only for free purchases (as
-- 0011 did for coupon purchases):
-- * amount_cents: a card purchase still costs more than 0; a coupon or free
--   purchase costs exactly 0.
-- * consent: the withdrawal consent (§ 356 (5) BGB) is about a payment.
--   Nothing is paid for a free design, so the dialog does not ask for it.
-- * A free purchase never has Stripe ids or a receipt, so the refund code can
--   never send one to Stripe; and it is not also a coupon purchase.
-- * The hash is only ever set on a free purchase, in the counter's format.
-- The purchases table is small, so checking the new constraints against its
-- rows takes a moment.
alter table public.purchases
  drop constraint purchases_amount_cents_check,
  add constraint purchases_amount_cents_check check (
    (coupon_id is null and free_day is null and amount_cents > 0)
    or ((coupon_id is not null or free_day is not null) and amount_cents = 0)
  ),
  drop constraint purchases_consent_unless_coupon,
  add constraint purchases_consent_unless_free check (
    coupon_id is not null or free_day is not null or (consent_at is not null and consent_text is not null)
  ),
  add constraint purchases_free_has_no_stripe check (
    free_day is null
    or (stripe_checkout_session_id is null and stripe_payment_intent_id is null and stripe_refund_id is null and receipt_url is null)
  ),
  add constraint purchases_free_or_coupon check (free_day is null or coupon_id is null),
  add constraint purchases_free_ip_hash_check check (
    free_ip_hash is null or (free_day is not null and free_ip_hash ~ '^[0-9a-f]{64}$')
  );

-- The sweep clears hashes older than yesterday. Only purchases whose design
-- is on its way (or that the sweep has not reached yet) carry one, so this
-- partial index stays tiny.
create index purchases_free_ip_hash_day_idx on public.purchases (free_day) where free_ip_hash is not null;

-- Owners read their purchases with an explicit column list (0007). Add
-- free_day to their grant; free_ip_hash and failure_reason stay out.
grant select (free_day) on table public.purchases to authenticated;

-- ---------------------------------------------------------------------------
-- The sweep, shared by claim_free_design() and free_designs_left()
-- ---------------------------------------------------------------------------

-- Deletes what is older than yesterday (UTC): first the hash on purchases of
-- those days, then the counters (purchases before counters, the lock order of
-- every function here). Usually there is nothing to delete, and both
-- statements are index scans that find nothing.
create function public.sweep_free_design_days()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_oldest_kept date := (now() at time zone 'utc')::date - 1;
begin
  update public.purchases p
    set free_ip_hash = null
    where p.free_ip_hash is not null and p.free_day < v_oldest_kept;
  delete from public.free_design_days f where f.day < v_oldest_kept;
end;
$$;

comment on function public.sweep_free_design_days() is
  'Deletes free-design counters older than yesterday (UTC) and clears the hash from purchases of those days. Server only (service_role).';

-- ---------------------------------------------------------------------------
-- claim_free_design: take one of the day's uses and record the purchase
-- ---------------------------------------------------------------------------

-- Outcomes:
--   claimed           one use taken; purchase_id is the new paid purchase
--   used_up           this address has used the day's free designs
--   in_progress       a design for this letter is already paid or designing
--   letter_not_found  the letter is not this owner's built letter (server code
--                     checks this first through row-level security; this is
--                     the backstop)
-- uses_left is what is left today after this call (null for in_progress and
-- letter_not_found, which take nothing and do not look). Nothing is changed
-- unless the outcome is 'claimed', apart from the sweep.
create function public.claim_free_design(
  p_ip_hash text,
  p_day date,
  p_owner_id uuid,
  p_letter_id uuid,
  p_request text,
  p_limit integer
)
returns table (outcome text, purchase_id uuid, uses_left integer)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone 'utc')::date;
  v_used integer;
  v_purchase_id uuid;
begin
  if p_ip_hash is null or p_day is null or p_owner_id is null or p_letter_id is null or p_request is null or p_limit is null then
    raise exception 'claim_free_design: every argument is required';
  end if;
  if p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'claim_free_design: p_ip_hash must be a SHA-256 hex digest';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'claim_free_design: p_limit must be between 1 and 100';
  end if;
  -- The day is inside the hash, so server code sends the day it hashed. It
  -- must be today in UTC, give or take a clock a moment either side of
  -- midnight.
  if p_day < v_today - 1 or p_day > v_today + 1 then
    raise exception 'claim_free_design: p_day must be today (UTC)';
  end if;

  perform public.sweep_free_design_days();

  -- Only a built letter (not a calendar) of this owner can have a wrapper.
  if not exists (
    select 1 from public.letters l
    where l.id = p_letter_id and l.owner_id = p_owner_id and l.kind = 'letter' and jsonb_typeof(l.content) = 'object'
  ) then
    return query select 'letter_not_found'::text, null::uuid, null::integer;
    return;
  end if;

  -- A design for this letter is already on its way: take nothing. (The
  -- unique index purchases_one_run_per_letter_idx catches one that starts
  -- between here and the insert.)
  if exists (
    select 1 from public.purchases p where p.letter_id = p_letter_id and p.status in ('paid', 'designing')
  ) then
    return query select 'in_progress'::text, null::uuid, null::integer;
    return;
  end if;

  begin
    -- The one statement that takes a use. The first claim of the day inserts
    -- the row; later ones, and concurrent ones, queue on its lock and each
    -- re-checks used < p_limit against the row the one before left. When
    -- the check fails nothing is updated and nothing is returned.
    insert into public.free_design_days as f (day, ip_hash, used)
      values (p_day, p_ip_hash, 1)
      on conflict (day, ip_hash) do update
        set used = f.used + 1
        where f.used < p_limit
      returning f.used into v_used;

    if v_used is null then
      return query select 'used_up'::text, null::uuid, 0;
      return;
    end if;

    insert into public.purchases (owner_id, letter_id, status, request, amount_cents, currency, free_day, free_ip_hash, paid_at)
      values (p_owner_id, p_letter_id, 'paid', p_request, 0, 'eur', p_day, p_ip_hash, now())
      returning id into v_purchase_id;
  exception when unique_violation then
    -- A concurrent purchase of the same letter became paid first
    -- (purchases_one_run_per_letter_idx). Leaving this block rolls back the
    -- use taken above, so the address keeps it.
    return query select 'in_progress'::text, null::uuid, null::integer;
    return;
  end;

  return query select 'claimed'::text, v_purchase_id, greatest(p_limit - v_used, 0);
end;
$$;

comment on function public.claim_free_design(text, date, uuid, uuid, text, integer) is
  'Takes one of the day''s free designs for a hashed address and records a paid purchase (amount 0) for the letter, in one transaction. Server only (service_role).';

-- ---------------------------------------------------------------------------
-- free_designs_left: what the dialog shows ("Free today: 2 of 3 left")
-- ---------------------------------------------------------------------------

create function public.free_designs_left(p_ip_hash text, p_day date, p_limit integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_used integer;
begin
  if p_ip_hash is null or p_day is null or p_limit is null then
    raise exception 'free_designs_left: every argument is required';
  end if;
  perform public.sweep_free_design_days();
  select f.used into v_used from public.free_design_days f where f.day = p_day and f.ip_hash = p_ip_hash;
  return greatest(p_limit - coalesce(v_used, 0), 0);
end;
$$;

comment on function public.free_designs_left(text, date, integer) is
  'How many of the day''s free designs a hashed address has left. Sweeps counters older than yesterday first. Server only (service_role).';

-- ---------------------------------------------------------------------------
-- return_free_design: a free purchase's design could not be made
-- ---------------------------------------------------------------------------

-- Marks the purchase failed, clears its hash and gives the day's use back,
-- once: a second call (the dead-letter queue after the job) finds it failed
-- already and changes nothing. The purchase row is locked first, so two
-- calls at once queue and the second re-checks the status the first left.
-- A use from a day older than yesterday is not given back (that counter is
-- gone, or being swept). A failed purchase leaves
-- purchases_one_run_per_letter_idx, so the sender can try again. Returns true
-- when the purchase was marked failed here.
create function public.return_free_design(p_purchase_id uuid, p_reason text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_day date;
  v_hash text;
begin
  select p.free_day, p.free_ip_hash into v_day, v_hash
    from public.purchases p
    where p.id = p_purchase_id
      and p.free_day is not null
      and p.status in ('paid', 'designing')
    for update;

  if not found then
    return false;
  end if;

  update public.purchases p
    set status = 'failed',
        finished_at = now(),
        free_ip_hash = null,
        failure_reason = left(coalesce(p_reason, 'The design could not be made'), 1000)
    where p.id = p_purchase_id;

  if v_hash is not null and v_day >= (now() at time zone 'utc')::date - 1 then
    update public.free_design_days f
      set used = f.used - 1
      where f.day = v_day and f.ip_hash = v_hash and f.used > 0;
  end if;
  return true;
end;
$$;

comment on function public.return_free_design(uuid, text) is
  'Marks a free purchase failed and gives the day''s use back to its hashed address, once. Server only (service_role).';

-- New functions in public are executable by everyone by default.
revoke execute on function public.sweep_free_design_days() from public, anon, authenticated;
revoke execute on function public.claim_free_design(text, date, uuid, uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.free_designs_left(text, date, integer) from public, anon, authenticated;
revoke execute on function public.return_free_design(uuid, text) from public, anon, authenticated;
grant execute on function public.sweep_free_design_days() to service_role;
grant execute on function public.claim_free_design(text, date, uuid, uuid, text, integer) to service_role;
grant execute on function public.free_designs_left(text, date, integer) to service_role;
grant execute on function public.return_free_design(uuid, text) to service_role;
