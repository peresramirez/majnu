import type { Metadata } from "next"
import { getMyBillingProfile } from "@/lib/billing/profiles"
import { billingEnabled } from "@/lib/limits"
import { PlanView, type PlanNotice } from "./plan-view"

export const metadata: Metadata = { title: "Plan" }
export const dynamic = "force-dynamic"

function noticeFrom(value: string | string[] | undefined): PlanNotice {
  return value === "error" || value === "pending" ? value : null
}

export default async function PlanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [profile, params] = await Promise.all([getMyBillingProfile(), searchParams])
  return (
    <PlanView
      details={{
        plan: profile?.plan ?? "free",
        planRenewsAt: profile?.planRenewsAt ?? null,
        planCancelAt: profile?.planCancelAt ?? null,
        hasSubscription: Boolean(profile?.stripeSubscriptionId),
      }}
      billing={billingEnabled()}
      notice={noticeFrom(params.billing)}
    />
  )
}
