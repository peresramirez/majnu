-- Majnu: coupon codes for the personalised wrapper (issue #72,
-- docs/features/coupons.md).
--
-- A coupon code makes the €2.99 wrapper free: the sender types it in the
-- "Make it unique" dialog, and the design starts without Stripe, without a
-- card and, for guests, without creating an account. The developer uses them
-- to test the whole flow; they can also be handed out.
--
-- How a code is kept: only the SHA-256 (hex) of the normalised code is stored
-- (upper case, without spaces or dashes; lib/billing/coupon-code.ts). By
-- default a code is 16 random characters from a 23-character alphabet, about
-- 72 bits; the developer can also choose one to print (`--code LAYLA100`, 6 to
-- 24 letters and digits), which is meant to be public. `npm run coupon create`
-- prints the code once and stores its hash (scripts/coupon.ts).
--
-- One use per person: a user (guest or member) can redeem a given code once.
-- purchases_one_redemption_per_user_idx enforces it; a failed run frees it,
-- so the code works again for that person, as the dialog promises.
--
-- Redeeming is one call to redeem_coupon(), one transaction: it checks the
-- letter, refuses when a design for it is already on its way, takes one use
-- with a conditional update (uses < max_uses), and records the purchase as
-- paid with amount 0 and the coupon. Two people redeeming the last use at once
-- both reach the same coupon row; the second waits for the first's row lock,
-- then re-checks uses < max_uses against the row the first left, finds no use
-- left and gets 'used_up'. Server code then hands the purchase to the design
-- queue exactly as a paid one (lib/billing/coupons.ts).
--
-- A design run that fails for a coupon purchase never goes to Stripe: the job
-- calls return_coupon_use(), which marks the purchase failed and gives the use
-- back, once (lib/billing/refunds.ts).
--
-- Access model, as for the other server-only tables (0010_provider_spend.sql):
-- * coupons: row-level security on, no policies, no privileges for anon or
--   authenticated. Only service_role reads or writes it, so no browser can
--   list codes, read their hashes or change their uses.
-- * Both functions can be executed by service_role only.
-- * purchases: owners may read the new coupon_id column of their own rows
--   (it is an id, never a code), so the Purchases tab can say "Free with a
--   code". Writes stay with service_role.

-- ---------------------------------------------------------------------------
-- coupons
-- ---------------------------------------------------------------------------

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  -- SHA-256 of the normalised code, lower-case hex. Unique, which also gives
  -- the index redeem_coupon() looks codes up by.
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  -- For us: who or what the code is for ("Launch test", "Anna's friends").
  label text check (label is null or char_length(label) between 1 and 200),
  max_uses integer not null check (max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  -- Null: never expires.
  expires_at timestamptz,
  -- `npm run coupon disable <code>` sets this to false. A disabled code is
  -- answered as invalid, like a code that does not exist.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint coupons_uses_within_max check (uses <= max_uses)
);

comment on table public.coupons is 'Coupon codes for the personalised wrapper, stored as SHA-256 hashes. Read and written only by server code with the service-role key.';

alter table public.coupons enable row level security;

-- Supabase grants new tables to anon and authenticated by default. Revoke
-- that; only the service role works with coupons.
revoke all on table public.coupons from anon, authenticated;
grant select, insert, update, delete on table public.coupons to service_role;

-- ---------------------------------------------------------------------------
-- purchases: a purchase can be paid with a coupon
-- ---------------------------------------------------------------------------

-- A nullable column without a default is a catalogue-only change. The foreign
-- key keeps a coupon from being deleted while purchases point at it (disable
-- it instead); every existing row is null, so checking it reads nothing.
alter table public.purchases
  add column coupon_id uuid references public.coupons (id) on delete restrict;

comment on column public.purchases.coupon_id is
  'The coupon that paid for this wrapper, or null when Stripe did. A coupon purchase has amount 0, no consent and no Stripe ids.';

-- One redemption of a code per user: a second purchase with the same coupon
-- and owner fails with 23505, unless the first one failed (its use was given
-- back). It also serves redeem_coupon()'s check. Card purchases have no
-- coupon, so the index is partial.
create unique index purchases_one_redemption_per_user_idx
  on public.purchases (coupon_id, owner_id)
  where coupon_id is not null and status <> 'failed';

-- For the foreign key (deleting a coupon looks up all its purchases, failed
-- ones too). Most rows are null, so this index is partial as well.
create index purchases_coupon_id_idx on public.purchases (coupon_id) where coupon_id is not null;

-- Relax only what a coupon purchase needs, and only for coupon purchases:
-- * amount_cents: a card purchase still costs more than 0; a coupon purchase
--   costs exactly 0.
-- * consent_at and consent_text: the withdrawal consent (§ 356 (5) BGB) is
--   about a payment. Nothing is paid with a coupon, so the dialog does not ask
--   for it; a card purchase must still have both.
-- * A coupon purchase never has Stripe ids or a receipt, so the refund code
--   can never send one to Stripe.
-- The purchases table is small, so checking the new constraints against its
-- rows takes a moment.
alter table public.purchases
  alter column consent_at drop not null,
  alter column consent_text drop not null,
  drop constraint purchases_amount_cents_check,
  add constraint purchases_amount_cents_check check (
    (coupon_id is null and amount_cents > 0) or (coupon_id is not null and amount_cents = 0)
  ),
  add constraint purchases_consent_unless_coupon check (
    coupon_id is not null or (consent_at is not null and consent_text is not null)
  ),
  add constraint purchases_coupon_has_no_stripe check (
    coupon_id is null
    or (stripe_checkout_session_id is null and stripe_payment_intent_id is null and stripe_refund_id is null and receipt_url is null)
  );

-- Owners read their purchases with an explicit column list (0007). Add the
-- new column to their grant; failure_reason stays out.
grant select (coupon_id) on table public.purchases to authenticated;

-- ---------------------------------------------------------------------------
-- redeem_coupon: take one use and record the purchase, atomically
-- ---------------------------------------------------------------------------

-- Outcomes:
--   redeemed          one use taken; purchase_id is the new paid purchase
--   invalid           no such code, or it was disabled (the same answer, so
--                     nobody learns which codes exist)
--   expired           the code's expiry has passed
--   used_up           every use is taken
--   in_progress       a design for this letter is already paid or designing
--   already_redeemed  this user has redeemed this code before (and that
--                     design did not fail)
--   letter_not_found  the letter is not this owner's built letter (server code
--                     checks this first through row-level security; this is
--                     the backstop)
-- Nothing is changed unless the outcome is 'redeemed'.
create function public.redeem_coupon(
  p_code_hash text,
  p_owner_id uuid,
  p_letter_id uuid,
  p_request text
)
returns table (outcome text, purchase_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_coupon_id uuid;
  v_purchase_id uuid;
  v_active boolean;
  v_expires_at timestamptz;
  v_constraint text;
begin
  if p_code_hash is null or p_owner_id is null or p_letter_id is null or p_request is null then
    raise exception 'redeem_coupon: every argument is required';
  end if;

  -- Only a built letter (not a calendar) of this owner can have a wrapper.
  if not exists (
    select 1 from public.letters l
    where l.id = p_letter_id and l.owner_id = p_owner_id and l.kind = 'letter' and jsonb_typeof(l.content) = 'object'
  ) then
    return query select 'letter_not_found'::text, null::uuid;
    return;
  end if;

  -- A design for this letter is already on its way: take nothing. (The
  -- unique index below catches one that starts between here and the insert.)
  if exists (
    select 1 from public.purchases p where p.letter_id = p_letter_id and p.status in ('paid', 'designing')
  ) then
    return query select 'in_progress'::text, null::uuid;
    return;
  end if;

  -- One redemption per person. (The unique index below catches a second
  -- redemption by the same user that starts at the same moment.) A disabled
  -- code is still answered as invalid, further down.
  if exists (
    select 1 from public.purchases p
    join public.coupons c on c.id = p.coupon_id
    where c.code_hash = p_code_hash and c.active and p.owner_id = p_owner_id and p.status <> 'failed'
  ) then
    return query select 'already_redeemed'::text, null::uuid;
    return;
  end if;

  begin
    -- The one statement that takes a use. Concurrent redeems of the same code
    -- queue on this row's lock and each re-checks the condition.
    update public.coupons c
      set uses = c.uses + 1
      where c.code_hash = p_code_hash
        and c.active
        and (c.expires_at is null or c.expires_at > now())
        and c.uses < c.max_uses
      returning c.id into v_coupon_id;

    if v_coupon_id is null then
      select c.active, c.expires_at into v_active, v_expires_at
        from public.coupons c where c.code_hash = p_code_hash;
      if not found or not v_active then
        return query select 'invalid'::text, null::uuid;
      elsif v_expires_at is not null and v_expires_at <= now() then
        return query select 'expired'::text, null::uuid;
      else
        return query select 'used_up'::text, null::uuid;
      end if;
      return;
    end if;

    insert into public.purchases (owner_id, letter_id, status, request, amount_cents, currency, coupon_id, paid_at)
      values (p_owner_id, p_letter_id, 'paid', p_request, 0, 'eur', v_coupon_id, now())
      returning id into v_purchase_id;
  exception when unique_violation then
    -- A concurrent redeem got there first: another design for this letter
    -- became paid (purchases_one_run_per_letter_idx), or the same user
    -- redeemed this code for another letter
    -- (purchases_one_redemption_per_user_idx). Leaving this block rolls back
    -- the use taken above, so the code keeps it.
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'purchases_one_redemption_per_user_idx' then
      return query select 'already_redeemed'::text, null::uuid;
    else
      return query select 'in_progress'::text, null::uuid;
    end if;
    return;
  end;

  return query select 'redeemed'::text, v_purchase_id;
end;
$$;

comment on function public.redeem_coupon(text, uuid, uuid, text) is
  'Takes one use of an active, unexpired coupon and records a paid purchase (amount 0) for the letter, in one transaction. Server only (service_role).';

-- ---------------------------------------------------------------------------
-- return_coupon_use: a coupon purchase's design could not be made
-- ---------------------------------------------------------------------------

-- Marks the purchase failed and gives its coupon one use back, once: a second
-- call (the dead-letter queue after the job) finds it failed already and
-- changes nothing. A failed purchase leaves purchases_one_redemption_per_user_idx,
-- so the same person can redeem the code again. Returns true when the use was
-- given back.
create function public.return_coupon_use(p_purchase_id uuid, p_reason text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_coupon_id uuid;
begin
  update public.purchases p
    set status = 'failed',
        finished_at = now(),
        failure_reason = left(coalesce(p_reason, 'The design could not be made'), 1000)
    where p.id = p_purchase_id
      and p.coupon_id is not null
      and p.status in ('paid', 'designing')
    returning p.coupon_id into v_coupon_id;

  if v_coupon_id is null then
    return false;
  end if;

  update public.coupons c
    set uses = c.uses - 1
    where c.id = v_coupon_id and c.uses > 0;
  return true;
end;
$$;

comment on function public.return_coupon_use(uuid, text) is
  'Marks a coupon purchase failed and gives its coupon one use back, once. Server only (service_role).';

-- New functions in public are executable by everyone by default.
revoke execute on function public.redeem_coupon(text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.return_coupon_use(uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_coupon(text, uuid, uuid, text) to service_role;
grant execute on function public.return_coupon_use(uuid, text) to service_role;
