import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { reserve, settle } = vi.hoisted(() => ({
  reserve: vi.fn(async (provider: string, usd: number) => ({ provider, month: "2026-11-01", usd }) as { provider: string; month: string; usd: number } | null),
  settle: vi.fn(async () => {}),
}))
vi.mock("@/lib/providers/ledger", () => ({ reserveFallbackSpend: reserve, settleFallbackSpend: settle }))

import { ProviderUnavailableError, callWithFallback } from "@/lib/providers/fallback"
import { COOL_OFF_MS, isCoolingOff, resetCoolingOff } from "@/lib/providers/keys"

class KeyError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`${status} ${code}`)
  }
}

// An OpenAI-like call: run() answers per key from `answers`.
function setup(answers: Record<string, () => unknown>) {
  const run = vi.fn(async (key: string) => {
    const answer = answers[key]
    if (!answer) throw new Error(`unexpected key ${key}`)
    return answer() as { seconds: number }
  })
  const call = () =>
    callWithFallback({
      provider: "openai",
      reserveUsd: 0.01,
      run,
      switchReason: (e) => (e instanceof KeyError ? (e.status === 401 ? "authentication" : e.code === "insufficient_quota" ? "quota" : null) : null),
      costUsd: (r) => r.seconds / 1000,
    })
  return { run, call }
}

const ok = (seconds = 5) => () => ({ seconds })
const fail = (status: number, code = "") => () => {
  throw new KeyError(status, code)
}

let warnings: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  resetCoolingOff()
  vi.useRealTimers()
  vi.stubEnv("OPENAI_API_KEY", "primary-key")
  vi.stubEnv("OPENAI_API_KEY_FALLBACK", "fallback-key")
  warnings = vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  warnings.mockRestore()
})

describe("callWithFallback", () => {
  it("without a fallback key, uses the primary and passes every error on, as before", async () => {
    vi.stubEnv("OPENAI_API_KEY_FALLBACK", "")
    const { run, call } = setup({ "primary-key": fail(429, "insufficient_quota") })
    await expect(call()).rejects.toBeInstanceOf(KeyError)
    expect(run).toHaveBeenCalledTimes(1)
    expect(reserve).not.toHaveBeenCalled()
    expect(isCoolingOff("OPENAI_API_KEY")).toBe(false)
  })

  it("uses the primary while it works, and counts nothing", async () => {
    const { run, call } = setup({ "primary-key": ok() })
    await expect(call()).resolves.toEqual({ seconds: 5 })
    expect(run.mock.calls.map((c) => c[0])).toEqual(["primary-key"])
    expect(reserve).not.toHaveBeenCalled()
  })

  it("does not switch on an ordinary error", async () => {
    const { run, call } = setup({ "primary-key": fail(429, "rate_limit_exceeded") })
    await expect(call()).rejects.toThrow("429 rate_limit_exceeded")
    expect(run).toHaveBeenCalledTimes(1)
    expect(isCoolingOff("OPENAI_API_KEY")).toBe(false)
  })

  it("switches on insufficient quota: reserves, calls the fallback, settles its cost, and logs the switch", async () => {
    const { run, call } = setup({ "primary-key": fail(429, "insufficient_quota"), "fallback-key": ok(12) })
    await expect(call()).resolves.toEqual({ seconds: 12 })
    expect(run.mock.calls.map((c) => c[0])).toEqual(["primary-key", "fallback-key"])
    expect(reserve).toHaveBeenCalledWith("openai", 0.01)
    expect(settle).toHaveBeenCalledWith({ provider: "openai", month: "2026-11-01", usd: 0.01 }, 0.012)
    expect(warnings.mock.calls.flat().join(" ")).toMatch(/openai: OPENAI_API_KEY refused \(quota\); using OPENAI_API_KEY_FALLBACK for the next 15 minutes/)
  })

  it("goes straight to the fallback while the primary cools off, and back to the primary after 15 minutes", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-22T20:00:00Z") })
    const { run, call } = setup({ "primary-key": fail(401), "fallback-key": ok() })
    await call()
    await call()
    expect(run.mock.calls.map((c) => c[0])).toEqual(["primary-key", "fallback-key", "fallback-key"])
    vi.setSystemTime(Date.now() + COOL_OFF_MS)
    run.mockClear()
    await call()
    expect(run.mock.calls.map((c) => c[0])).toEqual(["primary-key", "fallback-key"])
  })

  it("refuses with ProviderUnavailableError when the cap is reached, without calling the fallback", async () => {
    reserve.mockResolvedValueOnce(null)
    const { run, call } = setup({ "primary-key": fail(429, "insufficient_quota"), "fallback-key": ok() })
    await expect(call()).rejects.toBeInstanceOf(ProviderUnavailableError)
    expect(run.mock.calls.map((c) => c[0])).toEqual(["primary-key"])
  })

  it("refuses when the fallback is refused too, releases its reservation and cools it off", async () => {
    const { run, call } = setup({ "primary-key": fail(429, "insufficient_quota"), "fallback-key": fail(401, "invalid_api_key") })
    await expect(call()).rejects.toThrow(/No openai key can be used right now: OPENAI_API_KEY_FALLBACK refused \(authentication\)/)
    expect(settle).toHaveBeenCalledWith(expect.objectContaining({ usd: 0.01 }), 0)
    expect(isCoolingOff("OPENAI_API_KEY_FALLBACK")).toBe(true)
    // Both cooling off: the primary is tried once more, as a last resort.
    run.mockClear()
    await expect(call()).rejects.toBeInstanceOf(ProviderUnavailableError)
    expect(run.mock.calls.map((c) => c[0])).toEqual(["primary-key"])
  })

  it("passes an ordinary fallback error on, releasing the reservation", async () => {
    const { call } = setup({ "primary-key": fail(401), "fallback-key": fail(500, "server_error") })
    await expect(call()).rejects.toThrow("500 server_error")
    expect(settle).toHaveBeenCalledWith(expect.anything(), 0)
    expect(isCoolingOff("OPENAI_API_KEY_FALLBACK")).toBe(false)
  })

  it("uses the primary again as a last resort when the fallback is over its cap while the primary cools off", async () => {
    const { run, call } = setup({ "primary-key": fail(401), "fallback-key": ok() })
    await call()
    reserve.mockResolvedValueOnce(null)
    run.mockClear()
    // The primary has been fixed in the meantime.
    run.mockImplementation(async () => ({ seconds: 1 }))
    await expect(call()).resolves.toEqual({ seconds: 1 })
    expect(run.mock.calls.map((c) => c[0])).toEqual(["primary-key"])
  })
})
