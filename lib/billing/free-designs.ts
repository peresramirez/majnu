// Three free personalised wrappers per IP address per UTC day (issue #85,
// docs/features/free-designs.md).
//
// While Google's branding verification is pending, everyone (guests and
// members) may have the €2.99 wrapper made for free a few times a day. The
// "Make it unique" dialog then leads with the free design: no account step,
// no consent box, no Stripe. Coupon codes and payment work as before once the
// day's free designs are used.
//
// The IP address is used for one thing and never kept: it is turned into
// HMAC-SHA-256("free-designs:<UTC day>:<address>") under OPEN_HASH_SECRET,
// the server secret open tracking uses (lib/open/visitor.ts), and only that
// hash reaches the database. Without the secret the hash cannot be turned back
// into an address; because the day is inside it, the same address gives an
// unrelated hash every day. The address is never logged.
//
// Everything else is as for a coupon (./coupons.ts): the letter must be the
// sender's own built letter, claim_free_design() (0012_free_designs.sql) takes
// one of the day's uses and records the purchase as paid with amount 0 in one
// transaction, and the purchase then goes to the design queue exactly like one
// Stripe confirmed. A failed run gives the use back (return_free_design, from
// ./refunds.ts). Nothing here calls Stripe.
import "server-only"
import { WRAPPER_REQUEST_MAX_CHARS, wrapper } from "@/lib/plans"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMyLetterForWrapper } from "./my-purchases"
import { getPurchase, returnFreeDesign, type Purchase } from "./purchases"
import { enqueueDesign } from "./queue"
import { cleanWrapperRequest, type BillingUser } from "./service"
import type { FreeDesigns } from "./view"

// The developer's decision of 22 November: three a day for each connection.
export const FREE_DESIGNS_PER_DAY = 3

// MAJNU_FREE_DESIGNS_PER_DAY changes the number without a code change; 0
// switches free designs off (the dialog is then as before issue #85).
export function freeDesignsPerDay(): number {
  const raw = process.env.MAJNU_FREE_DESIGNS_PER_DAY?.trim()
  if (!raw) return FREE_DESIGNS_PER_DAY
  const value = Number(raw)
  return Number.isInteger(value) && value >= 0 && value <= 100 ? value : FREE_DESIGNS_PER_DAY
}

// ---------- The address and its hash ----------

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

function ipv4(text: string): string | null {
  const match = IPV4.exec(text)
  if (!match) return null
  const parts = match.slice(1).map(Number)
  return parts.every((n) => n <= 255) ? parts.join(".") : null
}

// The eight 16-bit groups of an IPv6 address, or null if it is not one.
function ipv6Groups(text: string): number[] | null {
  const halves = text.split("::")
  if (halves.length > 2) return null
  const parse = (half: string): number[] | null => {
    if (half === "") return []
    const groups: number[] = []
    const parts = half.split(":")
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      // An IPv4 tail ("::ffff:192.0.2.1", "64:ff9b::192.0.2.1") is two groups.
      if (i === parts.length - 1 && part.includes(".")) {
        const v4 = ipv4(part)
        if (!v4) return null
        const [a, b, c, d] = v4.split(".").map(Number)
        groups.push((a << 8) | b, (c << 8) | d)
        continue
      }
      if (!/^[0-9a-f]{1,4}$/i.test(part)) return null
      groups.push(parseInt(part, 16))
    }
    return groups
  }
  const head = parse(halves[0])
  const tail = halves.length === 2 ? parse(halves[1]) : []
  if (!head || !tail) return null
  if (halves.length === 1) return head.length === 8 ? head : null
  const missing = 8 - head.length - tail.length
  if (missing < 1) return null
  return [...head, ...new Array<number>(missing).fill(0), ...tail]
}

// One connection, written one way: an IPv4 address as is, an IPv4 address
// mapped into IPv6 as the IPv4 address, and any other IPv6 address as its /64
// network. A phone or home router gets a whole /64 and changes the last 64
// bits at will, so counting full IPv6 addresses would let one connection
// claim free designs without end. Null for anything that is not an address.
export function normaliseIp(raw: string): string | null {
  let text = raw.trim()
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1)
  const zone = text.indexOf("%")
  if (zone !== -1) text = text.slice(0, zone)
  if (!text || text.length > 64) return null
  const v4 = ipv4(text)
  if (v4) return v4
  const groups = ipv6Groups(text)
  if (!groups) return null
  const mapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff
  if (mapped) return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".")
  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(":")}::/64`
}

// The visitor's address: Cloudflare's CF-Connecting-IP, which the Worker
// always receives and a visitor cannot set. X-Forwarded-For only in `next
// dev`, which has no Cloudflare in front; anywhere else it is whatever the
// visitor sent. Null when there is none, and free designs are not offered.
export function freeDesignIp(headers: Headers): string | null {
  const cloudflare = headers.get("cf-connecting-ip")?.trim()
  if (cloudflare) return normaliseIp(cloudflare)
  if (process.env.NODE_ENV !== "development") return null
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded ? normaliseIp(forwarded) : null
}

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

// HMAC-SHA-256, lower-case hex. "free-designs:" keeps these hashes apart from
// every other use of the same secret; the day comes before the address, whose
// IPv6 form has colons of its own, so the message reads one way only.
export async function freeDesignKey(input: { ip: string; day: string; secret: string }): Promise<string> {
  // Hashing an address without a secret would be reversible by trying every address.
  if (!input.secret) throw new Error("OPEN_HASH_SECRET is not set")
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", encoder.encode(input.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`free-designs:${input.day}:${input.ip}`))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

type Counter = { ipHash: string; day: string; perDay: number }

// What the database needs to count this request's free designs, or null when
// they are not offered: switched off, no secret, or no address.
async function counterFor(headers: Headers, now: Date): Promise<Counter | null> {
  const perDay = freeDesignsPerDay()
  if (perDay === 0) return null
  const secret = process.env.OPEN_HASH_SECRET
  if (!secret) {
    console.warn("free designs are off: OPEN_HASH_SECRET is not set")
    return null
  }
  const ip = freeDesignIp(headers)
  if (!ip) return null
  const day = utcDay(now)
  return { ipHash: await freeDesignKey({ ip, day, secret }), day, perDay }
}

// ---------- How many are left ----------

// For GET /api/purchases: "Free today: 2 of 3 left". Null when free designs
// are not offered to this request.
export async function freeDesignsLeft(headers: Headers, now: Date = new Date()): Promise<FreeDesigns | null> {
  const counter = await counterFor(headers, now)
  if (!counter) return null
  const { data, error } = await createAdminClient().rpc("free_designs_left", {
    p_ip_hash: counter.ipHash,
    p_day: counter.day,
    p_limit: counter.perDay,
  })
  if (error) throw new Error(`Could not count today's free designs: ${error.message}`)
  return { left: typeof data === "number" ? Math.max(0, Math.min(data, counter.perDay)) : 0, perDay: counter.perDay }
}

// ---------- Claiming one ----------

export type FreeDesignInput = { letterId: unknown; request: unknown }

export type FreeDesignRefusal =
  | "invalid_request"
  | "letter_not_found"
  | "not_a_letter"
  | "not_built"
  | "in_progress"
  | "free_used_up"
  | "free_unavailable"

export type FreeDesignClaim =
  | { kind: "claimed"; purchase: Purchase; letter: { slug: string; title: string | null }; freeDesigns: FreeDesigns }
  | { kind: "refused"; reason: FreeDesignRefusal; message: string; freeDesigns: FreeDesigns | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The same answers as Checkout and coupons for the letter.
const REFUSALS: Record<FreeDesignRefusal, string> = {
  invalid_request: `Describe the look you want in a few words (at most ${WRAPPER_REQUEST_MAX_CHARS} characters).`,
  letter_not_found: "We couldn't find that gift.",
  not_a_letter: "Personalised wrappers are for letters and gifts. A calendar keeps its own design.",
  not_built: "Wrap the gift first, then make it unique.",
  in_progress: "A design for this gift is already being made. It shows on the gift page as soon as it is ready.",
  free_used_up: `Today's free designs are used up. You can still make it unique with a code, or for ${wrapper.price}.`,
  free_unavailable: "Free designs aren't available just now.",
}

function refused(reason: FreeDesignRefusal, freeDesigns: FreeDesigns | null = null): FreeDesignClaim {
  return { kind: "refused", reason, message: REFUSALS[reason], freeDesigns }
}

type ClaimRow = { outcome: string; purchase_id: string | null; uses_left: number | null }

// Guests may claim one: nothing is paid, so no receipt and no email.
export async function claimFreeDesign(
  user: Pick<BillingUser, "id">,
  input: FreeDesignInput,
  headers: Headers,
  now: Date = new Date(),
): Promise<FreeDesignClaim> {
  const request = cleanWrapperRequest(input.request)
  if (!request) return refused("invalid_request")
  if (typeof input.letterId !== "string" || !UUID.test(input.letterId)) return refused("letter_not_found")
  const counter = await counterFor(headers, now)
  if (!counter) return refused("free_unavailable")

  const letter = await getMyLetterForWrapper(input.letterId)
  if (!letter) return refused("letter_not_found")
  // A calendar baked into one static page would carry its locked doors.
  if (letter.kind !== "letter") return refused("not_a_letter")
  if (!letter.built) return refused("not_built")

  const { data, error } = await createAdminClient()
    .rpc("claim_free_design", {
      p_ip_hash: counter.ipHash,
      p_day: counter.day,
      p_owner_id: user.id,
      p_letter_id: letter.id,
      p_request: request,
      p_limit: counter.perDay,
    })
    .single<ClaimRow>()
  if (error) throw new Error(`Could not claim a free design: ${error.message}`)
  if (data.outcome === "used_up") return refused("free_used_up", { left: 0, perDay: counter.perDay })
  if (data.outcome === "in_progress") return refused("in_progress")
  if (data.outcome !== "claimed" || !data.purchase_id) return refused("letter_not_found")

  const purchaseId = data.purchase_id
  let purchase: Purchase | null
  try {
    purchase = await getPurchase(purchaseId)
    if (!purchase) throw new Error("The free purchase could not be read back")
    // As for a paid purchase: the queue in production, the dev server's
    // background in `next dev`. A duplicate hand-over is harmless.
    await enqueueDesign(purchaseId)
  } catch (error) {
    // The design cannot start, so the use is given back rather than spent on
    // a purchase that would wait for ever and block the letter.
    await returnFreeDesign(purchaseId, `Could not start the design: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
  const left = typeof data.uses_left === "number" ? Math.max(0, data.uses_left) : 0
  return { kind: "claimed", purchase, letter: { slug: letter.slug, title: null }, freeDesigns: { left, perDay: counter.perDay } }
}
