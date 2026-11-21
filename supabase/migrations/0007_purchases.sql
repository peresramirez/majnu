-- Majnu: purchases of the personalised wrapper (issue #39, docs/business-plan.md,
-- docs/features/billing.md).
--
-- Everything in Majnu is free except one thing: a personalised wrapper, a
-- one-off design for one gift made by the designer job in a Daytona sandbox,
-- for €2.99 once. One row here is one wrapper for one letter.
--
-- Life of a row (lib/billing/purchases.ts):
--   pending    POST /api/checkout inserted it, with the sender's design request
--              and their consent, and opened a Stripe Checkout Session.
--   paid       Stripe confirmed the payment (the webhook or the return page).
--              The change from pending is a conditional update, so it happens
--              once however often Stripe delivers the event.
--   designing  The design job claimed it (again a conditional update, so a
--              duplicate queue message never starts a second paid run).
--   done       The design is stored in letter_designs and design_id points at it.
--   failed     The run failed and the automatic refund failed too: someone has
--              to refund by hand. failure_reason says why.
--   refunded   The run failed and the payment was refunded through Stripe.
-- A pending row whose Checkout was abandoned simply stays pending; it is not a
-- purchase and the Purchases tab does not list it.
--
-- Access model, as for letter_designs (0003_letter_designs.sql):
-- * Row-level security is on. There are no policies and no grants for `anon`.
-- * Owners can read their own purchases (the Purchases tab and the status the
--   sender watches), except failure_reason, which is for us.
-- * Every write goes through server code with the service-role key. The
--   status, the Stripe ids, the amount and the design must never come from a
--   value the browser sent. There is no insert, update or delete for
--   `authenticated`.

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- The gift the wrapper is for. Kept (as null) if the letter is deleted, so
  -- the record of the payment survives; Stripe keeps its own record either way.
  letter_id uuid references public.letters (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'designing', 'done', 'failed', 'refunded')),
  -- The sender's short description of the look they want. Untrusted text: the
  -- job hands it to the sandbox as a file, never as part of a command.
  request text not null check (char_length(request) between 1 and 2000),
  -- Express consent to immediate delivery and to losing the right of
  -- withdrawal (digital content made to order, § 356 (5) BGB): when the sender
  -- ticked the box and the exact sentence they agreed to.
  consent_at timestamptz not null,
  consent_text text not null check (char_length(consent_text) between 1 and 1000),
  -- What Checkout charged, in the smallest unit (299 = €2.99), VAT included.
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_refund_id text,
  -- Stripe's hosted receipt for the charge, shown on the Purchases tab.
  receipt_url text check (receipt_url is null or receipt_url ~ '^https://'),
  design_id uuid references public.letter_designs (id) on delete set null,
  -- Why a run failed, for us. Owners cannot read it (see the grants below).
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 1000),
  paid_at timestamptz,
  design_started_at timestamptz,
  finished_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchases_done_has_design check (status <> 'done' or design_id is not null)
);

comment on table public.purchases is 'Personalised wrapper purchases: one paid design for one letter. Written only by server code with the service-role key.';

-- The Purchases tab lists a user's purchases, newest first; the RLS policy
-- filters on owner_id. One index serves both, and the cascade from auth.users.
create index purchases_owner_id_created_at_idx on public.purchases (owner_id, created_at desc);

-- The letter's preview asks for the purchases of one letter, and deleting a
-- letter sets letter_id to null on its rows.
create index purchases_letter_id_idx on public.purchases (letter_id);

-- Deleting a design (with its letter) sets design_id to null here.
create index purchases_design_id_idx on public.purchases (design_id) where design_id is not null;

-- At most one paid run per letter at a time. If a sender pays twice for the
-- same letter (two Checkout tabs), the second payment cannot move to paid
-- while the first is still in progress: the server refunds it instead.
create unique index purchases_one_run_per_letter_idx
  on public.purchases (letter_id)
  where status in ('paid', 'designing');

create trigger purchases_set_updated_at
  before update on public.purchases
  for each row execute function public.set_updated_at();

alter table public.purchases enable row level security;

create policy "Owners can read their own purchases"
  on public.purchases for select
  to authenticated
  using (owner_id = (select auth.uid()));

-- Supabase grants new tables to anon and authenticated by default. Revoke that,
-- then give owners a column grant that leaves failure_reason out. No insert,
-- update or delete for either role.
revoke all on table public.purchases from anon, authenticated;
grant select (
  id, owner_id, letter_id, status, request, consent_at, consent_text, amount_cents, currency,
  stripe_checkout_session_id, stripe_payment_intent_id, stripe_refund_id, receipt_url, design_id,
  paid_at, design_started_at, finished_at, refunded_at, created_at, updated_at
) on table public.purchases to authenticated;
grant select, insert, update, delete on table public.purchases to service_role;
