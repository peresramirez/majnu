import { afterEach, describe, expect, it, vi } from "vitest"
import {
  LIMITS,
  canUseFeature,
  chatTurnsResult,
  countChatTurns,
  dailyLettersResult,
  fullMoonOnlyResult,
  monthlyGiftsResult,
  startOfUtcDay,
  startOfUtcMonth,
} from "@/lib/limits"

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(() => {
    throw new Error("the database must not be touched")
  }),
}))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient }))

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("countChatTurns", () => {
  it("counts messages the sender typed", () => {
    const chat = [
      { role: "user", content: "It's for Anna's birthday" },
      { role: "assistant", content: [{ type: "text", text: "Lovely." }] },
      { role: "user", content: [{ type: "text", text: "Today is 2026-11-21" }, { type: "text", text: "Make it warm" }] },
    ]
    expect(countChatTurns(chat)).toBe(2)
  })

  it("does not count tool results, assistant turns or malformed entries", () => {
    const chat = [
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "build_letter", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "done" }] },
      { role: "user", content: [] },
      null,
      "hello",
      { role: "user" },
    ]
    expect(countChatTurns(chat)).toBe(0)
  })
})

describe("limit results", () => {
  it("allows 5 letters a day", () => {
    expect(dailyLettersResult(LIMITS.lettersPerDay - 1)).toEqual({ ok: true })
    expect(dailyLettersResult(LIMITS.lettersPerDay)).toMatchObject({ ok: false, reason: "daily_letters" })
  })

  it("allows 40 chat turns per letter", () => {
    expect(chatTurnsResult(LIMITS.chatTurnsPerLetter - 1)).toEqual({ ok: true })
    expect(chatTurnsResult(LIMITS.chatTurnsPerLetter)).toMatchObject({ ok: false, reason: "chat_turns" })
  })

  it("allows 3 gifts a month on the free plan", () => {
    expect(monthlyGiftsResult(2)).toEqual({ ok: true })
    expect(monthlyGiftsResult(3)).toMatchObject({ ok: false, reason: "monthly_gifts" })
  })

  it("keeps calendars and research for Full moon", () => {
    expect(fullMoonOnlyResult("calendar")).toMatchObject({ ok: false, reason: "full_moon_only" })
    expect(fullMoonOnlyResult("research")).toMatchObject({ ok: false, reason: "full_moon_only" })
  })

  it("writes messages in the brand voice", () => {
    const results = [dailyLettersResult(9), chatTurnsResult(99), monthlyGiftsResult(9), fullMoonOnlyResult("calendar"), fullMoonOnlyResult("research")]
    for (const result of results) {
      if (result.ok) throw new Error("expected a limit")
      expect(result.message).not.toMatch(/!|unlock|oops|magic/i)
      expect(result.message.length).toBeLessThan(160)
    }
  })
})

describe("UTC boundaries", () => {
  it("starts the day and the month at UTC midnight", () => {
    const now = new Date("2026-11-21T23:59:59.999+05:00") // 18:59 UTC
    expect(startOfUtcDay(now).toISOString()).toBe("2026-11-21T00:00:00.000Z")
    expect(startOfUtcMonth(now).toISOString()).toBe("2026-11-01T00:00:00.000Z")
  })
})

describe("canUseFeature", () => {
  it("lets everyone use every feature while billing is off, without a database call", async () => {
    vi.stubEnv("MAJNU_BILLING", "")
    for (const feature of ["calendar", "research", "new_gift"] as const) {
      expect(await canUseFeature(feature)).toEqual({ ok: true })
    }
    expect(createClient).not.toHaveBeenCalled()
  })
})
