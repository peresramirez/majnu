// POST /api/open: the open-tracking beacon on /l/[slug].
//
// Body (JSON, any content type, so navigator.sendBeacon works):
//   { slug, type: "open" | "door_open" | "gift_click", day?: number }
// Always answers 204 with no body and no cookies, whether or not the event was
// recorded, so the endpoint reveals nothing about which slugs exist.
// Excluded from the middleware matcher: it needs no session.
import * as z from "zod/v4"
import { recordOpenEvent } from "@/lib/open/record"
import { clientIp } from "@/lib/open/visitor"

export const dynamic = "force-dynamic"

const MAX_BODY = 1024

const OpenRequest = z.object({
  slug: z.string().min(1).max(64),
  type: z.enum(["open", "door_open", "gift_click"]),
  day: z.number().int().min(0).max(366).optional(),
})

function empty(status: number) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const text = await request.text()
  if (text.length > MAX_BODY) return empty(413)

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return empty(400)
  }
  const parsed = OpenRequest.safeParse(json)
  if (!parsed.success) return empty(400)

  try {
    await recordOpenEvent({
      ...parsed.data,
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent") ?? "",
    })
  } catch (error) {
    // Tracking must never break the letter page; log and move on.
    console.error("open tracking failed", error instanceof Error ? error.message : error)
  }
  return empty(204)
}
