import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { COOL_OFF_MS, coolOff, coolingOffReason, fallbackCapUsd, fallbackKey, isCoolingOff, resetCoolingOff } from "@/lib/providers/keys"

afterEach(() => resetCoolingOff())

describe("fallbackKey", () => {
  it("is the fallback variable, trimmed, and nothing when it is empty or the primary itself", () => {
    expect(fallbackKey("anthropic", { ANTHROPIC_API_KEY: "a", ANTHROPIC_API_KEY_FALLBACK: "  b  " })).toBe("b")
    expect(fallbackKey("openai", { OPENAI_API_KEY: "a", OPENAI_API_KEY_FALLBACK: "" })).toBeUndefined()
    expect(fallbackKey("daytona", { DAYTONA_API_KEY: "same", DAYTONA_API_KEY_FALLBACK: "same" })).toBeUndefined()
    expect(fallbackKey("daytona", {})).toBeUndefined()
  })
})

describe("fallbackCapUsd", () => {
  it("defaults to $150, reads FALLBACK_CAP_USD, and ignores nonsense", () => {
    expect(fallbackCapUsd({})).toBe(150)
    expect(fallbackCapUsd({ FALLBACK_CAP_USD: "" })).toBe(150)
    expect(fallbackCapUsd({ FALLBACK_CAP_USD: "40.5" })).toBe(40.5)
    expect(fallbackCapUsd({ FALLBACK_CAP_USD: "0" })).toBe(0)
    expect(fallbackCapUsd({ FALLBACK_CAP_USD: "-3" })).toBe(150)
    expect(fallbackCapUsd({ FALLBACK_CAP_USD: "lots" })).toBe(150)
  })
})

describe("cooling-off", () => {
  it("lasts 15 minutes from the refusal, then the key is tried again", () => {
    const t0 = 1_000_000
    expect(COOL_OFF_MS).toBe(15 * 60 * 1000)
    expect(isCoolingOff("ANTHROPIC_API_KEY", t0)).toBe(false)
    coolOff("ANTHROPIC_API_KEY", "spend_limit", t0)
    expect(isCoolingOff("ANTHROPIC_API_KEY", t0 + 1)).toBe(true)
    expect(coolingOffReason("ANTHROPIC_API_KEY", t0 + 1)).toBe("spend_limit")
    expect(isCoolingOff("ANTHROPIC_API_KEY", t0 + COOL_OFF_MS - 1)).toBe(true)
    expect(isCoolingOff("ANTHROPIC_API_KEY", t0 + COOL_OFF_MS)).toBe(false)
    // Each key on its own.
    expect(isCoolingOff("OPENAI_API_KEY", t0 + 1)).toBe(false)
  })

  it("starts again from a new refusal", () => {
    coolOff("DAYTONA_API_KEY", "quota", 0)
    coolOff("DAYTONA_API_KEY", "quota", COOL_OFF_MS - 10)
    expect(isCoolingOff("DAYTONA_API_KEY", COOL_OFF_MS + 10)).toBe(true)
  })
})
