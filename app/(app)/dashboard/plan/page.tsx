import { redirect } from "next/navigation"

// The Plan tab became Purchases when the subscription was retired
// (docs/business-plan.md). Old links, bookmarks and sign-in redirects land here.
export default function PlanPage() {
  redirect("/dashboard/purchases")
}
