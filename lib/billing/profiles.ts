// Reads and writes of the billing columns in `profiles`. Writes use the
// service-role client: the plan, the Stripe ids and the dates are written only
// by server code (checkout, the return page and the Stripe webhook), never from
// a value the browser sent. Users can read their own row through RLS.
import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { PlanId, PlanState } from "./subscription"

export type BillingProfile = {
  userId: string
  plan: PlanId
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  planRenewsAt: string | null
  planCancelAt: string | null
}

type ProfileRow = {
  user_id: string
  plan: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plan_renews_at: string | null
  // Added by supabase/migrations/0002_billing.sql.
  plan_cancel_at?: string | null
}

const COLUMNS = "user_id, plan, stripe_customer_id, stripe_subscription_id, plan_renews_at, plan_cancel_at"

function toProfile(row: ProfileRow): BillingProfile {
  return {
    userId: row.user_id,
    plan: row.plan === "full-moon" ? "full-moon" : "free",
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    planRenewsAt: row.plan_renews_at,
    planCancelAt: row.plan_cancel_at ?? null,
  }
}

export async function getBillingProfile(userId: string): Promise<BillingProfile | null> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select(COLUMNS)
    .eq("user_id", userId)
    .maybeSingle<ProfileRow>()
  if (error) throw new Error(`Could not load the billing profile: ${error.message}`)
  return data ? toProfile(data) : null
}

export async function getBillingProfileByCustomer(customerId: string): Promise<BillingProfile | null> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select(COLUMNS)
    .eq("stripe_customer_id", customerId)
    .maybeSingle<ProfileRow>()
  if (error) throw new Error(`Could not load the billing profile: ${error.message}`)
  return data ? toProfile(data) : null
}

// Stores the user's Stripe customer id, unless one is already stored, and
// returns the id on file. The update only matches a row without a customer, so
// two requests racing each other cannot replace one customer with another.
export async function saveCustomerId(userId: string, customerId: string): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("profiles")
    .update({ stripe_customer_id: customerId })
    .eq("user_id", userId)
    .is("stripe_customer_id", null)
    .select("user_id")
  if (error) throw new Error(`Could not save the Stripe customer: ${error.message}`)
  if (data && data.length > 0) return customerId

  const existing = await getBillingProfile(userId)
  if (existing?.stripeCustomerId) return existing.stripeCustomerId

  // No profile row at all (the sign-up trigger normally creates one).
  const { error: insertError } = await admin.from("profiles").insert({ user_id: userId, stripe_customer_id: customerId })
  if (insertError) throw new Error(`Could not save the Stripe customer: ${insertError.message}`)
  return customerId
}

export async function savePlanState(userId: string, state: PlanState): Promise<void> {
  const { error } = await createAdminClient()
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        plan: state.plan,
        stripe_subscription_id: state.subscriptionId,
        plan_renews_at: state.renewsAt,
        plan_cancel_at: state.cancelAt,
      },
      { onConflict: "user_id" },
    )
  if (error) throw new Error(`Could not save the plan: ${error.message}`)
}

// The signed-in user's own plan, for the Plan tab, read through RLS.
// select("*") rather than a column list, so the tab still loads if
// 0002_billing.sql has not been applied yet (plan_cancel_at is then absent).
export async function getMyBillingProfile(): Promise<BillingProfile | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("profiles").select("*").maybeSingle<ProfileRow>()
  if (error) throw new Error(`Could not load your plan: ${error.message}`)
  return data ? toProfile(data) : null
}
