import type { Metadata } from "next"
import { listMyPurchases } from "@/lib/billing/purchases"
import { toPurchaseView } from "@/lib/billing/view"
import { PurchasesView, type PurchasesNotice } from "./purchases-view"

export const metadata: Metadata = { title: "Purchases" }
export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The Purchases tab: every personalised wrapper the sender bought, with its
// status and receipt. After Checkout, /billing/return lands here with
// ?purchase=<id>, and that purchase's status is shown first and kept current.
export default async function PurchasesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [purchases, params] = await Promise.all([listMyPurchases(), searchParams])
  const focus = typeof params.purchase === "string" && UUID.test(params.purchase) ? params.purchase : null
  const notice: PurchasesNotice = params.billing === "processing" ? "processing" : null
  return <PurchasesView purchases={purchases.map(toPurchaseView)} focusId={focus} notice={notice} />
}
