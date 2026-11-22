import type { Metadata } from "next"
import { headers } from "next/headers"
import { confirmTopUp, designCreditsBalance, listMyCreditGrants } from "@/lib/billing/credits"
import { freeDesignsLeft } from "@/lib/billing/free-designs"
import { listMyPurchases } from "@/lib/billing/my-purchases"
import { toPurchaseView, toTopUpView } from "@/lib/billing/view"
import { createClient } from "@/lib/supabase/server"
import { PurchasesView, type PurchasesNotice } from "./purchases-view"

export const metadata: Metadata = { title: "Purchases" }
export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The Purchases tab: the "Personalisations" card (today's free designs, the
// member's balance, and buying more in advance), then every top-up and every
// personalised wrapper, with its status and receipt. After a wrapper's
// Checkout, /billing/return lands here with ?purchase=<id>, and that
// purchase's status is shown first and kept current. After a top-up's
// Checkout, Stripe lands here with ?topup=<session id>: the session is
// confirmed on the server (the webhook does the same; the credits are granted
// once whichever comes first, lib/billing/credits.ts) before the page reads
// the balance.
export default async function PurchasesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const guest = !user || user.is_anonymous === true

  let notice: PurchasesNotice = params.billing === "processing" ? "processing" : null
  const topup = typeof params.topup === "string" ? params.topup : null
  if (user && !guest && topup) {
    try {
      const result = await confirmTopUp({ id: user.id }, topup)
      if (result.outcome === "granted") notice = { kind: "topup", quantity: result.quantity }
      else if (result.outcome === "processing") notice = "processing"
    } catch (error) {
      // The webhook still grants them; the card shows them when it has.
      console.error("top-up return failed", error instanceof Error ? error.message : error)
      notice = "processing"
    }
  }

  const [purchases, grants, credits, freeDesigns] = await Promise.all([
    listMyPurchases(),
    listMyCreditGrants().catch((error: unknown) => {
      console.error("top-ups lookup failed", error instanceof Error ? error.message : error)
      return []
    }),
    user && !guest
      ? designCreditsBalance(user.id).catch((error: unknown) => {
          console.error("credits lookup failed", error instanceof Error ? error.message : error)
          return null
        })
      : Promise.resolve(null),
    freeDesignsLeft(await headers()).catch(() => null),
  ])
  const focus = typeof params.purchase === "string" && UUID.test(params.purchase) ? params.purchase : null
  return (
    <PurchasesView
      purchases={purchases.map(toPurchaseView)}
      topUps={grants.map(toTopUpView)}
      account={guest ? "guest" : "member"}
      credits={credits}
      freeDesigns={freeDesigns}
      focusId={focus}
      notice={notice}
    />
  )
}
