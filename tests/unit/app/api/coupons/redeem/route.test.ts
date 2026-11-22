// POST /api/coupons/redeem with the coupon service replaced by a fake: what the
// route accepts (guests included), what it passes on, how each refusal is
// answered, and that the coupon path never touches Checkout.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

let user: { id: string; email?: string; is_anonymous?: boolean } | null
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock("@/lib/billing/coupons", () => ({ redeemWrapperCoupon: vi.fn() }))
// If anything on this path opened Checkout, these would be called.
vi.mock("@/lib/billing/service", () => ({ startWrapperCheckout: vi.fn() }))
vi.mock("@/lib/billing/stripe", () => ({ createStripeClient: vi.fn() }))

import { POST } from "@/app/api/coupons/redeem/route"
import { redeemWrapperCoupon } from "@/lib/billing/coupons"
import type { Purchase } from "@/lib/billing/purchases"
import { startWrapperCheckout } from "@/lib/billing/service"
import { createStripeClient } from "@/lib/billing/stripe"

const LETTER = "0b6f2a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5c"
const BODY = { letterId: LETTER, request: "Pressed flowers on old paper", coupon: "K7QM-3XRA-PD9C-WHTE" }

const PURCHASE: Purchase = {
  id: "00000000-0000-4000-8000-000000000001",
  ownerId: "guest-1",
  letterId: LETTER,
  status: "paid",
  request: BODY.request,
  consentAt: null,
  amountCents: 0,
  currency: "eur",
  couponId: "c0000000-0000-4000-8000-000000000001",
  checkoutSessionId: null,
  paymentIntentId: null,
  refundId: null,
  receiptUrl: null,
  designId: null,
  paidAt: "2026-11-22T08:00:00.000Z",
  designStartedAt: null,
  finishedAt: null,
  refundedAt: null,
  createdAt: "2026-11-22T08:00:00.000Z",
}

function post(body: unknown = BODY, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request("https://majnu.app/api/coupons/redeem", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://majnu.app", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://majnu.app")
  user = { id: "guest-1", is_anonymous: true }
  vi.mocked(redeemWrapperCoupon).mockResolvedValue({ kind: "redeemed", purchase: PURCHASE, letter: { slug: "abcdefghij", title: null } })
})

describe("POST /api/coupons/redeem", () => {
  it("lets a guest redeem a code and answers with the purchase for the status card", async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    const body = await res.json()
    expect(body).toEqual({
      purchase: {
        id: PURCHASE.id,
        status: "paid",
        request: BODY.request,
        createdAt: PURCHASE.createdAt,
        paidAt: PURCHASE.paidAt,
        finishedAt: null,
        amount: "Free with a code",
        freeWithCode: true,
        receiptUrl: null,
        giftUrl: "/l/abcdefghij",
        giftTitle: null,
      },
    })
    expect(redeemWrapperCoupon).toHaveBeenCalledWith({ id: "guest-1" }, { letterId: LETTER, request: BODY.request, coupon: BODY.coupon })
  })

  it("lets a member redeem a code too", async () => {
    user = { id: "user-1", email: "anna@example.com", is_anonymous: false }
    expect((await post()).status).toBe(200)
    expect(vi.mocked(redeemWrapperCoupon).mock.calls[0][0]).toEqual({ id: "user-1" })
  })

  it("never opens Checkout or creates a Stripe client", async () => {
    await post()
    expect(startWrapperCheckout).not.toHaveBeenCalled()
    expect(createStripeClient).not.toHaveBeenCalled()
  })

  it("ignores a consent the browser sends: nothing is paid", async () => {
    await post({ ...BODY, consent: true, amountCents: 0 })
    expect(vi.mocked(redeemWrapperCoupon).mock.calls[0][1]).toEqual({ letterId: LETTER, request: BODY.request, coupon: BODY.coupon })
  })

  it.each([
    ["code_invalid", 400],
    ["invalid_request", 400],
    ["letter_not_found", 404],
    ["in_progress", 409],
    ["code_already_used", 409],
    ["code_used_up", 410],
    ["code_expired", 410],
    ["not_a_letter", 422],
    ["not_built", 422],
  ] as const)("answers a %s refusal with %i and the message", async (reason, status) => {
    vi.mocked(redeemWrapperCoupon).mockResolvedValue({ kind: "refused", reason, message: "why" })
    const res = await post()
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: "why", reason })
  })

  it("answers 401 without a session, before reading the body", async () => {
    user = null
    expect((await post()).status).toBe(401)
    expect(redeemWrapperCoupon).not.toHaveBeenCalled()
  })

  it("refuses a cross-site post", async () => {
    expect((await post(BODY, { origin: "https://evil.example" })).status).toBe(403)
    expect(redeemWrapperCoupon).not.toHaveBeenCalled()
  })

  it("refuses anything but JSON, so a plain cross-site form cannot redeem", async () => {
    expect((await post("coupon=x", { "content-type": "application/x-www-form-urlencoded" })).status).toBe(415)
    expect(redeemWrapperCoupon).not.toHaveBeenCalled()
  })

  it("answers 400 to a body that is not a JSON object", async () => {
    expect((await post("not json")).status).toBe(400)
    expect((await post("[1,2]")).status).toBe(400)
    expect(redeemWrapperCoupon).not.toHaveBeenCalled()
  })

  it("answers 502 when the design could not be started", async () => {
    vi.mocked(redeemWrapperCoupon).mockRejectedValue(new Error("queue unavailable"))
    const res = await post()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/Your code still works/)
  })
})

describe("a code remembered from a poster's short link", () => {
  const COOKIE = { cookie: "sb-x-auth-token=abc; majnu_coupon=LAYLA100" }

  it("is forgotten after a successful redemption", async () => {
    const res = await post({ ...BODY, coupon: "layla-100" }, COOKIE)
    expect(res.status).toBe(200)
    const cookie = res.headers.get("set-cookie") ?? ""
    expect(cookie).toMatch(/^majnu_coupon=;/)
    expect(cookie).toMatch(/Max-Age=0/)
  })

  it("is left alone when there is none", async () => {
    expect((await post()).headers.get("set-cookie")).toBeNull()
  })

  it.each(["code_invalid", "code_used_up", "code_expired", "code_already_used"] as const)("is forgotten when that code is refused as %s", async (reason) => {
    vi.mocked(redeemWrapperCoupon).mockResolvedValue({ kind: "refused", reason, message: "why" })
    const res = await post({ ...BODY, coupon: "LAYLA 100" }, COOKIE)
    expect(res.headers.get("set-cookie")).toMatch(/^majnu_coupon=; Max-Age=0/)
  })

  it("is kept when the refusal is not about that code", async () => {
    vi.mocked(redeemWrapperCoupon).mockResolvedValue({ kind: "refused", reason: "in_progress", message: "why" })
    expect((await post({ ...BODY, coupon: "LAYLA100" }, COOKIE)).headers.get("set-cookie")).toBeNull()
    vi.mocked(redeemWrapperCoupon).mockResolvedValue({ kind: "refused", reason: "code_invalid", message: "why" })
    expect((await post({ ...BODY, coupon: "OTHERCODE1" }, COOKIE)).headers.get("set-cookie")).toBeNull()
  })
})
