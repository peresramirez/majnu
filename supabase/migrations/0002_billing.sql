-- Majnu: billing state for the Full moon subscription (issue #14).
--
-- plan_cancel_at records a cancellation scheduled in the Stripe customer
-- portal. The subscription, and Full moon with it, stays active until that
-- moment (the end of the paid period, as the terms promise); then Stripe sends
-- customer.subscription.deleted and the webhook sets the plan back to free.
-- The Plan tab uses it to say "ends on" instead of "renews on".
--
-- Like every column in profiles, it is written only by server code with the
-- service-role key (lib/billing/profiles.ts). The existing grants already
-- cover it: authenticated users can select their own row through RLS and
-- cannot update any column.
--
-- A nullable column without a default is a catalog-only change: no table
-- rewrite, and the lock is held only for an instant.

alter table public.profiles
  add column if not exists plan_cancel_at timestamptz;

comment on column public.profiles.plan_cancel_at is
  'When Full moon ends because the subscriber cancelled in the Stripe portal; null while it renews. Written by the Stripe webhook and the checkout return.';

comment on column public.profiles.plan_renews_at is
  'End of the current paid Full moon period (the subscription item''s current_period_end). Written by the Stripe webhook and the checkout return.';
