// POST /api/designs/free end to end, over the real free-design service
// (lib/billing/free-designs.ts) and the real design job (lib/billing/fulfil.ts),
// with the database functions, the purchases table and the queue replaced by
// the fakes in tests/unit/lib/billing/fakes.ts. No design run starts, no model
// is called and Stripe is never reached.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// Every database function call, to check that the address never reaches it.
const rpcCalls = vi.hoisted(() => [] as [string, Record<string, unknown>][])

let user: { id: string; email?: string; is_anonymous?: boolean } | null
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock("@/lib/supabase/admin", async () => {
  const { freeDesignRpc } = await import("../../../../lib/billing/fakes")
  return {
    createAdminClient: () => ({
      rpc: (name: string, args: Record<string, unknown>) => {
        rpcCalls.push([name, args])
        const result = Promise.resolve(freeDesignRpc(name, args))
        return Object.assign(result, { single: () => result })
      },
    }),
  }
})
vi.mock("@/lib/billing/purchases", async () => (await import("../../../../lib/billing/fakes")).purchasesModule)
vi.mock("@/lib/billing/my-purchases", async () => (await import("../../../../lib/billing/fakes")).myPurchasesModule)
vi.mock("@/lib/billing/queue", () => ({ enqueueDesign: vi.fn(async () => "queued") }))
// If anything on this path opened Checkout or a refund, these would be called.
vi.mock("@/lib/billing/stripe", async () => {
  const { vi } = await import("vitest")
  return {
    createStripeClient: vi.fn(() => {
      throw new Error("the free design path must not create a Stripe client")
    }),
    wrapperPriceId: vi.fn(() => "price_test"),
    CHECKOUT_INTEGRATION_ID: "majnu_wrapper_test",
  }
})
vi.mock("@/lib/daytona/redesign", () => ({
  redesignLetter: vi.fn(async () => {
    throw new Error("the real redesign must not run in tests")
  }),
}))

import { POST } from "@/app/api/designs/free/route"
import { runPurchaseDesign } from "@/lib/billing/fulfil"
import { enqueueDesign } from "@/lib/billing/queue"
import { createStripeClient } from "@/lib/billing/stripe"
import { addLetter, db, resetDb } from "../../../../lib/billing/fakes"

const IP = "203.0.113.47"
const letterId = (n: number) => `0b6f2a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5${n}`
const body = (n: number) => ({ letterId: letterId(n), request: "Pressed flowers on old paper" })

function post(payload: unknown = body(1), headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request("https://majnu.app/api/designs/free", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://majnu.app", "cf-connecting-ip": IP, ...headers },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://majnu.app")
  vi.stubEnv("OPEN_HASH_SECRET", "test-open-hash-secret")
  vi.stubEnv("MAJNU_FREE_DESIGNS_PER_DAY", "")
  // .env.local holds real fallback keys; nothing here may reach a provider.
  vi.stubEnv("ANTHROPIC_API_KEY_FALLBACK", "")
  vi.stubEnv("DAYTONA_API_KEY_FALLBACK", "")
  rpcCalls.length = 0
  resetDb()
  db.currentUser = "guest-1"
  for (const n of [1, 2, 3, 4, 5]) addLetter(letterId(n), { ownerId: "guest-1" })
  user = { id: "guest-1", is_anonymous: true }
})

describe("POST /api/designs/free", () => {
  it("lets a guest have a free design, with no account step, and answers for the status card", async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    const json = await res.json()
    expect(json.freeDesigns).toEqual({ left: 2, perDay: 3 })
    expect(json.purchase).toMatchObject({
      status: "paid",
      amount: "Free",
      freeDesign: true,
      freeWithCode: false,
      receiptUrl: null,
      request: "Pressed flowers on old paper",
    })
    expect(json.purchase.giftUrl).toMatch(/^\/l\//)
    expect(enqueueDesign).toHaveBeenCalledWith(json.purchase.id)
  })

  it("lets a member have one too", async () => {
    user = { id: "guest-1", email: "anna@example.com", is_anonymous: false }
    expect((await post()).status).toBe(200)
  })

  it("never opens Checkout or creates a Stripe client", async () => {
    await post()
    expect(createStripeClient).not.toHaveBeenCalled()
  })

  it("refuses the fourth free design of the day from the same address with 429", async () => {
    for (const n of [1, 2, 3]) expect((await post(body(n))).status).toBe(200)
    const res = await post(body(4))
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ reason: "free_used_up", freeDesigns: { left: 0, perDay: 3 } })
    expect(enqueueDesign).toHaveBeenCalledTimes(3)
    // A different connection has its own three.
    expect((await post(body(4), { "cf-connecting-ip": "198.51.100.9" })).status).toBe(200)
  })

  it("counts an IPv6 connection by its /64, so changing the last part does not help", async () => {
    for (const n of [1, 2, 3]) expect((await post(body(n), { "cf-connecting-ip": `2001:db8:1:2::${n}` })).status).toBe(200)
    expect((await post(body(4), { "cf-connecting-ip": "2001:db8:1:2:aaaa::9" })).status).toBe(429)
  })

  it("gives the free design back when the run fails, without Stripe, so it can be used again", async () => {
    for (const n of [1, 2, 3]) await post(body(n))
    expect((await post(body(4))).status).toBe(429)
    const first = [...db.purchases.values()].find((p) => p.letterId === letterId(1))!

    const outcome = await runPurchaseDesign(first.id, {
      redesign: async () => {
        throw new Error("sandbox did not start")
      },
      log: () => undefined,
    })

    expect(outcome).toMatchObject({ outcome: "free_returned" })
    expect(db.purchases.get(first.id)).toMatchObject({ status: "failed", freeIpHash: null })
    expect(createStripeClient).not.toHaveBeenCalled()
    const again = await post(body(4))
    expect(again.status).toBe(200)
    expect((await again.json()).freeDesigns).toEqual({ left: 0, perDay: 3 })
  })

  it("never stores, sends or logs the IP address", async () => {
    const logged = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")].map((s) => s.mockImplementation(() => undefined))
    for (const n of [1, 2, 3, 4]) await post(body(n))
    expect(rpcCalls.length).toBeGreaterThan(0)
    expect(JSON.stringify(rpcCalls)).not.toContain(IP)
    expect(JSON.stringify([...db.purchases.values()])).not.toContain(IP)
    expect(JSON.stringify([...db.freeDays.values()])).not.toContain(IP)
    for (const spy of logged) expect(JSON.stringify(spy.mock.calls)).not.toContain(IP)
    for (const counter of db.freeDays.values()) expect(counter.ipHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("ignores X-Forwarded-For in production: without Cloudflare's header there are no free designs", async () => {
    const res = await post(body(1), { "cf-connecting-ip": "", "x-forwarded-for": "198.51.100.1" })
    expect(res.status).toBe(503)
    expect((await res.json()).reason).toBe("free_unavailable")
  })

  it("is 503 when free designs are switched off", async () => {
    vi.stubEnv("MAJNU_FREE_DESIGNS_PER_DAY", "0")
    expect((await post()).status).toBe(503)
    expect(enqueueDesign).not.toHaveBeenCalled()
  })

  it("answers 409 when a design for the gift is already on its way", async () => {
    await post()
    const res = await post()
    expect(res.status).toBe(409)
    expect((await res.json()).reason).toBe("in_progress")
  })

  it.each([
    ["a missing request", { letterId: letterId(1) }, 400, "invalid_request"],
    ["someone else's letter", { ...body(1), letterId: "11111111-2222-4333-8444-555555555555" }, 404, "letter_not_found"],
  ] as const)("answers %s with %i", async (_name, payload, status, reason) => {
    const res = await post(payload)
    expect(res.status).toBe(status)
    expect((await res.json()).reason).toBe(reason)
  })

  it("answers 422 for a calendar or an unbuilt letter", async () => {
    addLetter(letterId(1), { ownerId: "guest-1", kind: "calendar" })
    expect((await post(body(1))).status).toBe(422)
    addLetter(letterId(2), { ownerId: "guest-1", built: false })
    expect((await post(body(2))).status).toBe(422)
  })

  it("answers 401 without a session", async () => {
    user = null
    expect((await post()).status).toBe(401)
    expect(rpcCalls).toEqual([])
  })

  it("refuses a cross-site post", async () => {
    expect((await post(body(1), { origin: "https://evil.example" })).status).toBe(403)
    expect(rpcCalls).toEqual([])
  })

  it("refuses anything but JSON, so a plain cross-site form cannot claim one", async () => {
    expect((await post("letterId=x", { "content-type": "application/x-www-form-urlencoded" })).status).toBe(415)
    expect(rpcCalls).toEqual([])
  })

  it("answers 400 to a body that is not a JSON object", async () => {
    expect((await post("not json")).status).toBe(400)
    expect((await post("[1,2]")).status).toBe(400)
  })

  it("answers 502, and gives the free design back, when the design cannot be started", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(enqueueDesign).mockRejectedValueOnce(new Error("queue unavailable"))
    const res = await post()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/didn't use one of your free designs/)
    expect([...db.freeDays.values()][0].used).toBe(0)
  })
})
