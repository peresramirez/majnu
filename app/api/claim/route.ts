// /api/claim: guests claim a gift on an invitation's gift list (issue #35).
//
// POST { slug, itemId, name? } claims one gift. No account; nothing is stored
// on the guest's device; the claim is limited per visitor with the server-side
// visitor hash /api/open uses. Answers JSON:
//   200 { ok: true, claimed }                       the gift is now this guest's
//   400 { ok: false, error: "invalid_request" }
//   403 { ok: false, error: "cross_site" }          sent from another site
//   404 { ok: false, error: "not_found" }           no such invitation with a gift list
//   404 { ok: false, error: "item_not_found", claimed }
//   409 { ok: false, error: "taken", claimed }      someone claimed it first
//   413 { ok: false, error: "too_large" }
//   429 { ok: false, error: "too_many", claimed }   this visitor's claim limit
//   503 { ok: false, error: "unavailable" }
//   500 { ok: false, error: "server_error" }
// `claimed` is every gift id claimed on that invitation now, so the page can
// update the whole list at once.
//
// GET ?slug=... answers { claimed } with the same ids (empty for anything that
// is not an invitation with a gift list), for a page that could not read them
// while it rendered.
import { claimGift, getClaimedItemIds, type ClaimResult } from "@/lib/claims/claim"
import { ClaimRequest, cleanGuestName, SLUG } from "@/lib/claims/rules"
import { clientIp } from "@/lib/open/visitor"

export const dynamic = "force-dynamic"

const MAX_BODY = 1024

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

const STATUS: Record<ClaimResult["status"], number> = {
  claimed: 200,
  taken: 409,
  item_not_found: 404,
  too_many: 429,
  not_found: 404,
  unavailable: 503,
}

export async function POST(request: Request) {
  // Browsers say where a request came from. A claim made by another site's
  // page on the guest's behalf is refused; tools such as curl send no header.
  if (request.headers.get("sec-fetch-site") === "cross-site") return json(403, { ok: false, error: "cross_site" })

  const text = await request.text()
  if (text.length > MAX_BODY) return json(413, { ok: false, error: "too_large" })

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return json(400, { ok: false, error: "invalid_request" })
  }
  const parsed = ClaimRequest.safeParse(body)
  if (!parsed.success) return json(400, { ok: false, error: "invalid_request" })

  try {
    const result = await claimGift({
      slug: parsed.data.slug,
      itemId: parsed.data.itemId,
      guestName: cleanGuestName(parsed.data.name),
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent") ?? "",
    })
    if (result.status === "claimed") return json(200, { ok: true, claimed: result.claimed })
    return json(STATUS[result.status], { ok: false, error: result.status, ...("claimed" in result ? { claimed: result.claimed } : {}) })
  } catch (error) {
    console.error("gift claim failed", error instanceof Error ? error.message : error)
    return json(500, { ok: false, error: "server_error" })
  }
}

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug") ?? ""
  if (!SLUG.test(slug)) return json(200, { claimed: [] })
  try {
    return json(200, { claimed: await getClaimedItemIds(slug) })
  } catch (error) {
    console.error("loading gift claims failed", error instanceof Error ? error.message : error)
    return json(500, { error: "server_error" })
  }
}
