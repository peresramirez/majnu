import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// provider_spend and its two functions, as 0010_provider_spend.sql defines
// them: reserve adds only within the cap (one atomic step), settle corrects
// and never goes below zero. Each call waits a random moment first, so
// concurrent calls interleave as they would over the network.
const { db, rpc } = vi.hoisted(() => {
  const db = { rows: new Map<string, { spent: number; calls: number; refused: number }>(), fail: false }
  const pause = () => new Promise((resolve) => setTimeout(resolve, Math.random() * 3))
  const row = (provider: string, month: string) => {
    const key = `${provider}:${month}`
    if (!db.rows.has(key)) db.rows.set(key, { spent: 0, calls: 0, refused: 0 })
    return db.rows.get(key)!
  }
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    await pause()
    if (db.fail) return { data: null, error: { message: "connection refused" } }
    const r = row(String(args.p_provider), String(args.p_month))
    if (name === "reserve_provider_spend") {
      const usd = Number(args.p_usd)
      if (r.spent + usd <= Number(args.p_cap_usd) + 1e-9) {
        r.spent += usd
        r.calls++
        return { data: r.spent.toFixed(6), error: null }
      }
      r.refused++
      return { data: null, error: null }
    }
    r.spent = Math.max(r.spent + Number(args.p_delta_usd), 0)
    return { data: r.spent.toFixed(6), error: null }
  })
  return { db, rpc }
})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }))

import { monthOf, reserveFallbackSpend, settleFallbackSpend } from "@/lib/providers/ledger"

const NOW = new Date("2026-11-22T21:30:00Z")
let warnings: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  db.rows.clear()
  db.fail = false
  rpc.mockClear()
  vi.stubEnv("FALLBACK_CAP_USD", "")
  warnings = vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  warnings.mockRestore()
})

const spent = (provider = "anthropic", month = "2026-11-01") => db.rows.get(`${provider}:${month}`)?.spent ?? 0

describe("monthOf", () => {
  it("is the first day of the UTC month", () => {
    expect(monthOf(NOW)).toBe("2026-11-01")
    expect(monthOf(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-01")
    // Still November in UTC, already December in Berlin.
    expect(monthOf(new Date("2026-11-30T23:30:00Z"))).toBe("2026-11-01")
  })
})

describe("reserveFallbackSpend", () => {
  it("reserves with the provider, the month, the amount and the default $150 cap", async () => {
    const reservation = await reserveFallbackSpend("anthropic", 0.1234567, NOW)
    // Rounded up to the database's precision.
    expect(reservation).toEqual({ provider: "anthropic", month: "2026-11-01", usd: 0.123457 })
    expect(rpc).toHaveBeenCalledWith("reserve_provider_spend", { p_provider: "anthropic", p_month: "2026-11-01", p_usd: 0.123457, p_cap_usd: 150 })
  })

  it("refuses at $150: a call that would pass the cap is not made", async () => {
    expect(await reserveFallbackSpend("openai", 149.5, NOW)).not.toBeNull()
    expect(await reserveFallbackSpend("openai", 0.5, NOW)).not.toBeNull()
    expect(spent("openai")).toBeCloseTo(150, 6)
    expect(await reserveFallbackSpend("openai", 0.000001, NOW)).toBeNull()
    expect(warnings.mock.calls.flat().join(" ")).toMatch(/openai fallback refused: .* cap of \$150\.00 for 2026-11/)
    // Another provider has its own cap, and a new month starts from zero.
    expect(await reserveFallbackSpend("daytona", 1, NOW)).not.toBeNull()
    expect(await reserveFallbackSpend("openai", 1, new Date("2026-12-01T00:00:00Z"))).not.toBeNull()
  })

  it("holds the cap under concurrent calls", async () => {
    const results = await Promise.all(Array.from({ length: 300 }, () => reserveFallbackSpend("anthropic", 1, NOW)))
    expect(results.filter(Boolean)).toHaveLength(150)
    expect(spent()).toBeCloseTo(150, 6)
    // ...and with uneven amounts, never past it.
    db.rows.clear()
    await Promise.all(Array.from({ length: 200 }, (_, i) => reserveFallbackSpend("anthropic", 0.37 + (i % 7) * 0.61, NOW)))
    expect(spent()).toBeLessThanOrEqual(150)
    expect(spent()).toBeGreaterThan(145)
  })

  it("uses FALLBACK_CAP_USD, and 0 refuses every call", async () => {
    vi.stubEnv("FALLBACK_CAP_USD", "20")
    expect(await reserveFallbackSpend("anthropic", 15, NOW)).not.toBeNull()
    expect(await reserveFallbackSpend("anthropic", 6, NOW)).toBeNull()
    vi.stubEnv("FALLBACK_CAP_USD", "0")
    expect(await reserveFallbackSpend("openai", 0.01, NOW)).toBeNull()
  })

  it("refuses when the total cannot be checked", async () => {
    db.fail = true
    expect(await reserveFallbackSpend("anthropic", 0.01, NOW)).toBeNull()
    expect(warnings.mock.calls.flat().join(" ")).toMatch(/could not be checked \(connection refused\)/)
  })
})

describe("settleFallbackSpend", () => {
  it("replaces the reservation with the call's cost and logs the month's total", async () => {
    const reservation = (await reserveFallbackSpend("anthropic", 1.5, NOW))!
    await settleFallbackSpend(reservation, 0.0213)
    expect(spent()).toBeCloseTo(0.0213, 6)
    expect(rpc).toHaveBeenLastCalledWith("settle_provider_spend", { p_provider: "anthropic", p_month: "2026-11-01", p_delta_usd: -1.4787 })
    expect(warnings.mock.calls.flat().join(" ")).toMatch(/anthropic fallback call: about \$0\.0213; 2026-11 total \$0\.0213 of \$150\.00/)
  })

  it("releases a reservation completely for a call that cost nothing, and never throws", async () => {
    const reservation = (await reserveFallbackSpend("openai", 0.02, NOW))!
    await settleFallbackSpend(reservation, 0)
    expect(spent("openai")).toBe(0)
    const again = (await reserveFallbackSpend("openai", 0.02, NOW))!
    db.fail = true
    await expect(settleFallbackSpend(again, 0)).resolves.toBeUndefined()
    expect(warnings.mock.calls.flat().join(" ")).toMatch(/not settled, the reservation of \$0\.0200 stays counted/)
  })

  it("makes no database call when the cost is exactly the reservation", async () => {
    const reservation = (await reserveFallbackSpend("daytona", 0.05, NOW))!
    rpc.mockClear()
    await settleFallbackSpend(reservation, 0.05)
    expect(rpc).not.toHaveBeenCalled()
  })
})
