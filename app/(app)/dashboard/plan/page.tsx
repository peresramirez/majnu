import type { Metadata } from "next"
import { PlanView } from "@/components/app/plan-view"
import { getMyProfile } from "@/lib/letters/store"
import { billingEnabled } from "@/lib/limits"

export const metadata: Metadata = { title: "Plan" }
export const dynamic = "force-dynamic"

export default async function PlanPage() {
  const profile = await getMyProfile()
  return <PlanView profile={profile} billing={billingEnabled()} />
}
