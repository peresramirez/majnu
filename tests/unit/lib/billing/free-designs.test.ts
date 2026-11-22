// Free personalised wrappers per IP address per day (lib/billing/free-designs.ts),
// with the database calls, the purchases table, the design queue and Stripe
// replaced by fakes. The database functions themselves (the atomic counter,
// the give-back, the sweep, four claims at once from one address) were
// checked against Postgres; see docs/features/free-designs.md.
import { createHmac } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
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
vi.mock("@/lib/billing/purchases", async () => (await import("./fakes")).purchasesModule)
vi.mock("@/lib/billing/my-purchases", async () => (await import("./fakes")).myPurchasesModule)
vi.mock("@/lib/billing/queue", () => ({ enqueueDesign: vi.fn(async () => "queued") }))

// claim_free_design and free_designs_left, as the database answers them.
const rpc = vi.fn()
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      const result = Promise.resolve().then(() => rpc(name, args))
      return Object.assign(result, { single: () => result })
    },
  }),
}))

import {
  claimFreeDesign,
  FREE_DESIGNS_PER_DAY,
  freeDesignIp,
  freeDesignKey,
  freeDesignsLeft,
  freeDesignsPerDay,
  normaliseIp,
  utcDay,
} from "@/lib/billing/free-designs"
import { enqueueDesign } from "@/lib/billing/queue"
import { createStripeClient } from "@/lib/billing/stripe"
import { addLetter, db, freeDesignRpc, purchasesModule, resetDb } from "./fakes"

const SECRET = "test-open-hash-secret"
const LETTER = "0b6f2a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5c"
const GUEST = { id: "user-1" }
const IP = "203.0.113.47"
const NOW = new Date("2026-11-22T21:30:00.000Z")
const INPUT = { letterId: LETTER, request: "  Pressed flowers on old paper  " }

const headers = (h: Record<string, string> = { "cf-connecting-ip": IP }) => new Headers(h)
const expectedHash = (ip: string, day: string) => createHmac("sha256", SECRET).update(`free-designs:${day}:${ip}`).digest("hex")

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv("OPEN_HASH_SECRET", SECRET)
  vi.stubEnv("MAJNU_FREE_DESIGNS_PER_DAY", "")
  vi.mocked(enqueueDesign).mockReset().mockResolvedValue("queued")
  vi.mocked(createStripeClient).mockClear()
  Object.values(purchasesModule).forEach((fn) => fn.mockClear())
  rpc.mockReset().mockImplementation(freeDesignRpc)
  resetDb()
  addLetter(LETTER)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("normaliseIp", () => {
  it("keeps an IPv4 address, written one way", () => {
    expect(normaliseIp("203.0.113.47")).toBe("203.0.113.47")
    expect(normaliseIp(" 010.000.000.001 ")).toBe("10.0.0.1")
  })

  it("counts an IPv6 address by its /64 network, however it is written", () => {
    const a = normaliseIp("2001:db8:85a3:12::8a2e:370:7334")
    expect(a).toBe("2001:db8:85a3:12::/64")
    expect(normaliseIp("2001:0DB8:85A3:0012:ffff:0:0:1")).toBe(a)
    expect(normaliseIp("[2001:db8:85a3:12::1]")).toBe(a)
    expect(normaliseIp("2001:db8:85a3:12::1%en0")).toBe(a)
    expect(normaliseIp("2001:db8:85a3:13::1")).not.toBe(a)
    expect(normaliseIp("::1")).toBe("0:0:0:0::/64")
  })

  it("reads an IPv4 address mapped into IPv6 as the IPv4 address", () => {
    expect(normaliseIp("::ffff:203.0.113.47")).toBe("203.0.113.47")
    expect(normaliseIp("::ffff:cb00:712f")).toBe("203.0.113.47")
  })

  it("refuses anything that is not an address", () => {
    for (const bad of ["", "localhost", "256.1.1.1", "1.2.3", "1:2:3", "1::2::3", "2001:db8:::1", "12345::1", "1.2.3.4; drop", "1:2:3:4:5:6:7:8:9"]) {
      expect(normaliseIp(bad), bad).toBeNull()
    }
  })
})

describe("freeDesignIp", () => {
  it("reads Cloudflare's CF-Connecting-IP", () => {
    expect(freeDesignIp(headers({ "cf-connecting-ip": IP, "x-forwarded-for": "198.51.100.1" }))).toBe(IP)
  })

  it("ignores X-Forwarded-For outside next dev: a visitor can set it", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(freeDesignIp(headers({ "x-forwarded-for": "198.51.100.1" }))).toBeNull()
    vi.stubEnv("NODE_ENV", "test")
    expect(freeDesignIp(headers({ "x-forwarded-for": "198.51.100.1" }))).toBeNull()
  })

  it("uses the first X-Forwarded-For entry in next dev", () => {
    vi.stubEnv("NODE_ENV", "development")
    expect(freeDesignIp(headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1")
  })

  it("has none without a header", () => {
    expect(freeDesignIp(headers({}))).toBeNull()
  })
})

describe("freeDesignKey", () => {
  it("is HMAC-SHA-256 of free-designs:<day>:<address> under the secret", async () => {
    expect(await freeDesignKey({ ip: IP, day: "2026-11-22", secret: SECRET })).toBe(expectedHash(IP, "2026-11-22"))
  })

  it("changes every day, so one day's hash says nothing about the next", async () => {
    const monday = await freeDesignKey({ ip: IP, day: "2026-11-23", secret: SECRET })
    expect(monday).not.toBe(await freeDesignKey({ ip: IP, day: "2026-11-22", secret: SECRET }))
    expect(monday).toMatch(/^[0-9a-f]{64}$/)
  })

  it("needs the secret: an unkeyed hash of an address can be reversed by trying them all", async () => {
    await expect(freeDesignKey({ ip: IP, day: "2026-11-22", secret: "" })).rejects.toThrow(/OPEN_HASH_SECRET/)
  })

  it("is not the plain SHA-256 open tracking would give, nor contains the address", async () => {
    const key = await freeDesignKey({ ip: IP, day: "2026-11-22", secret: SECRET })
    expect(key).not.toContain(IP)
    expect(key).not.toBe(createHmac("sha256", SECRET).update(IP).digest("hex"))
  })
})

describe("the day and the number", () => {
  it("counts by UTC day", () => {
    expect(utcDay(new Date("2026-11-22T23:59:59.999Z"))).toBe("2026-11-22")
    expect(utcDay(new Date("2026-11-23T00:00:00.000Z"))).toBe("2026-11-23")
  })

  it("is 3 a day unless MAJNU_FREE_DESIGNS_PER_DAY says otherwise; 0 switches it off", () => {
    expect(FREE_DESIGNS_PER_DAY).toBe(3)
    expect(freeDesignsPerDay()).toBe(3)
    vi.stubEnv("MAJNU_FREE_DESIGNS_PER_DAY", "5")
    expect(freeDesignsPerDay()).toBe(5)
    vi.stubEnv("MAJNU_FREE_DESIGNS_PER_DAY", "0")
    expect(freeDesignsPerDay()).toBe(0)
    vi.stubEnv("MAJNU_FREE_DESIGNS_PER_DAY", "lots")
    expect(freeDesignsPerDay()).toBe(3)
  })
})

describe("freeDesignsLeft", () => {
  it("asks free_designs_left with the hash, the day and the limit, never the address", async () => {
    expect(await freeDesignsLeft(headers(), NOW)).toEqual({ left: 3, perDay: 3 })
    expect(rpc).toHaveBeenCalledWith("free_designs_left", { p_ip_hash: expectedHash(IP, "2026-11-22"), p_day: "2026-11-22", p_limit: 3 })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(IP)
  })

  it("is null, without asking the database, when free designs are not offered", async () => {
    expect(await freeDesignsLeft(headers({}), NOW)).toBeNull()
    vi.stubEnv("MAJNU_FREE_DESIGNS_PER_DAY", "0")
    expect(await freeDesignsLeft(headers(), NOW)).toBeNull()
    vi.stubEnv("MAJNU_FREE_DESIGNS_PER_DAY", "")
    vi.stubEnv("OPEN_HASH_SECRET", "")
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    expect(await freeDesignsLeft(headers(), NOW)).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it("throws when the database fails, for the route to fall back", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } })
    await expect(freeDesignsLeft(headers(), NOW)).rejects.toThrow(/boom/)
  })
})

describe("claimFreeDesign", () => {
  it("claims through claim_free_design with the hash and starts the design like a paid purchase", async () => {
    const result = await claimFreeDesign(GUEST, INPUT, headers(), NOW)

    expect(result.kind).toBe("claimed")
    if (result.kind !== "claimed") throw new Error("expected a claim")
    expect(rpc).toHaveBeenCalledWith("claim_free_design", {
      p_ip_hash: expectedHash(IP, "2026-11-22"),
      p_day: "2026-11-22",
      p_owner_id: "user-1",
      p_letter_id: LETTER,
      p_request: "Pressed flowers on old paper",
      p_limit: 3,
    })
    expect(result.purchase).toMatchObject({ status: "paid", amountCents: 0, freeDay: "2026-11-22", couponId: null, consentAt: null, paymentIntentId: null })
    expect(result.freeDesigns).toEqual({ left: 2, perDay: 3 })
    expect(enqueueDesign).toHaveBeenCalledWith(result.purchase.id)
    expect(createStripeClient).not.toHaveBeenCalled()
  })

  it("never sends the address to the database, and never logs it", async () => {
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")].map((spy) => spy.mockImplementation(() => undefined))
    await claimFreeDesign(GUEST, INPUT, headers(), NOW)
    await freeDesignsLeft(headers(), NOW)
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(IP)
    expect(JSON.stringify([...db.purchases.values()])).not.toContain(IP)
    for (const spy of logs) expect(JSON.stringify(spy.mock.calls)).not.toContain(IP)
  })

  it("refuses the fourth of the day for the same address, and lets another address claim", async () => {
    for (const n of [1, 2, 3]) {
      const letter = `0b6f2a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5${n}`
      addLetter(letter)
      expect((await claimFreeDesign(GUEST, { ...INPUT, letterId: letter }, headers(), NOW)).kind).toBe("claimed")
    }
    const fourth = await claimFreeDesign(GUEST, INPUT, headers(), NOW)
    expect(fourth).toMatchObject({ kind: "refused", reason: "free_used_up", freeDesigns: { left: 0, perDay: 3 } })
    if (fourth.kind === "refused") expect(fourth.message).toMatch(/with a code, or for €2\.99/)
    expect(enqueueDesign).toHaveBeenCalledTimes(3)
    expect((await claimFreeDesign(GUEST, INPUT, headers({ "cf-connecting-ip": "198.51.100.9" }), NOW)).kind).toBe("claimed")
  })

  it("starts counting again the next UTC day", async () => {
    for (const n of [1, 2, 3]) {
      const letter = `0b6f2a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5${n}`
      addLetter(letter)
      await claimFreeDesign(GUEST, { ...INPUT, letterId: letter }, headers(), NOW)
    }
    expect((await claimFreeDesign(GUEST, INPUT, headers(), NOW)).kind).toBe("refused")
    expect((await claimFreeDesign(GUEST, INPUT, headers(), new Date("2026-11-23T00:00:01.000Z"))).kind).toBe("claimed")
  })

  it("answers in_progress when a design for the letter is on its way, taking nothing", async () => {
    await claimFreeDesign(GUEST, INPUT, headers(), NOW)
    expect(await claimFreeDesign(GUEST, INPUT, headers(), NOW)).toMatchObject({ kind: "refused", reason: "in_progress" })
    expect(await freeDesignsLeft(headers(), NOW)).toEqual({ left: 2, perDay: 3 })
  })

  it.each([
    ["a missing request", { ...INPUT, request: "  " }, "invalid_request"],
    ["a request that is too long", { ...INPUT, request: "x".repeat(501) }, "invalid_request"],
    ["a bad letter id", { ...INPUT, letterId: "../etc" }, "letter_not_found"],
  ] as const)("refuses %s before asking the database", async (_name, input, reason) => {
    expect(await claimFreeDesign(GUEST, input, headers(), NOW)).toMatchObject({ kind: "refused", reason })
    expect(rpc).not.toHaveBeenCalled()
  })

  it("refuses letters that are not the sender's built letter, before asking the database", async () => {
    db.currentUser = "someone-else"
    expect(await claimFreeDesign(GUEST, INPUT, headers(), NOW)).toMatchObject({ reason: "letter_not_found" })
    db.currentUser = "user-1"
    addLetter(LETTER, { kind: "calendar" })
    expect(await claimFreeDesign(GUEST, INPUT, headers(), NOW)).toMatchObject({ reason: "not_a_letter" })
    addLetter(LETTER, { built: false })
    expect(await claimFreeDesign(GUEST, INPUT, headers(), NOW)).toMatchObject({ reason: "not_built" })
    expect(rpc).not.toHaveBeenCalled()
  })

  it("is unavailable without an address, without the secret or when switched off", async () => {
    expect(await claimFreeDesign(GUEST, INPUT, headers({}), NOW)).toMatchObject({ reason: "free_unavailable" })
    vi.stubEnv("MAJNU_FREE_DESIGNS_PER_DAY", "0")
    expect(await claimFreeDesign(GUEST, INPUT, headers(), NOW)).toMatchObject({ reason: "free_unavailable" })
    vi.stubEnv("MAJNU_FREE_DESIGNS_PER_DAY", "")
    vi.stubEnv("OPEN_HASH_SECRET", "")
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    expect(await claimFreeDesign(GUEST, INPUT, headers(), NOW)).toMatchObject({ reason: "free_unavailable" })
    expect(rpc).not.toHaveBeenCalled()
  })

  it("gives the free design back when the design cannot be started, and throws", async () => {
    vi.mocked(enqueueDesign).mockRejectedValue(new Error("queue unavailable"))
    await expect(claimFreeDesign(GUEST, INPUT, headers(), NOW)).rejects.toThrow(/queue unavailable/)
    const purchase = [...db.purchases.values()][0]
    expect(purchase).toMatchObject({ status: "failed", freeIpHash: null })
    expect(purchase.failureReason).toMatch(/Could not start the design/)
    expect(await freeDesignsLeft(headers(), NOW)).toEqual({ left: 3, perDay: 3 })
    expect(createStripeClient).not.toHaveBeenCalled()
  })

  it("throws when the database call fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "connection reset" } })
    await expect(claimFreeDesign(GUEST, INPUT, headers(), NOW)).rejects.toThrow(/connection reset/)
  })
})
