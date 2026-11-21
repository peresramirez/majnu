// GET /api/purchases/<id>: one of the sender's purchases, which the status
// card polls every few seconds after paying until the design is ready.
//
// 200 PurchaseView (lib/billing/view.ts); 400 for a bad id; 401 without a
// session; 404 for a purchase that is not the sender's (row-level security).
import { jsonError } from "@/lib/billing/http"
import { getMyPurchase } from "@/lib/billing/my-purchases"
import { toPurchaseView } from "@/lib/billing/view"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params
  if (!UUID.test(id)) return jsonError(400, "Unknown purchase.")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return jsonError(401, "Sign in first.")

  try {
    const purchase = await getMyPurchase(id)
    if (!purchase) return jsonError(404, "Unknown purchase.")
    return Response.json(toPurchaseView(purchase), { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("purchase lookup failed", error instanceof Error ? error.message : error)
    return jsonError(500, "Could not load the purchase.")
  }
}
