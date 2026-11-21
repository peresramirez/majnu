import { afterEach, describe, expect, it, vi } from "vitest"
import {
  LIMITS,
  canUseFeature,
  chatTurnsResult,
  countChatTurns,
  dailyLettersResult,
  fullMoonOnlyResult,
  monthlyGiftsResult,
  signInRequiredResult,
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

// A client whose auth answers with `user` and whose database must not be
// read unless `plan` is given.
function fakeClient(user: { id: string; is_anonymous?: boolean } | null, plan?: string) {
  const from = vi.fn(() => {
    if (plan === undefined) throw new Error("the database must not be touched")
    return { select: () => ({ maybeSingle: async () => ({ data: { plan }, error: null }) }) }
  })
  return { auth: { getUser: async () => ({ data: { user } }) }, from }
}

describe("canUseFeature", () => {
  afterEach(() => {
    createClient.mockReset()
    createClient.mockImplementation(() => {
      throw new Error("the database must not be touched")
    })
  })

  it("lets everyone use research and new gifts while billing is off, without a database call", async () => {
    vi.stubEnv("MAJNU_BILLING", "")
    for (const feature of ["research", "new_gift"] as const) {
      expect(await canUseFeature(feature)).toEqual({ ok: true })
    }
    expect(createClient).not.toHaveBeenCalled()
  })

  it("lets a real user make a calendar while billing is off, reading no table", async () => {
    vi.stubEnv("MAJNU_BILLING", "")
    const client = fakeClient({ id: "user-1", is_anonymous: false })
    createClient.mockImplementation((() => client) as never)
    expect(await canUseFeature("calendar")).toEqual({ ok: true })
    expect(client.from).not.toHaveBeenCalled()
  })

  it("asks a guest to sign up before a calendar, even while billing is off", async () => {
    vi.stubEnv("MAJNU_BILLING", "")
    createClient.mockImplementation((() => fakeClient({ id: "guest-1", is_anonymous: true })) as never)
    expect(await canUseFeature("calendar")).toEqual(signInRequiredResult())
  })

  it("checks for a guest before the plan when billing is on", async () => {
    vi.stubEnv("MAJNU_BILLING", "on")
    // The plan does not matter for a guest: the profile is never read.
    const client = fakeClient({ id: "guest-1", is_anonymous: true })
    createClient.mockImplementation((() => client) as never)
    expect(await canUseFeature("calendar")).toMatchObject({ ok: false, reason: "signin_required" })
    expect(client.from).not.toHaveBeenCalled()
  })

  it("still gates calendars on the plan for real users when billing is on", async () => {
    vi.stubEnv("MAJNU_BILLING", "on")
    createClient.mockImplementation((() => fakeClient({ id: "user-1" }, "free")) as never)
    expect(await canUseFeature("calendar")).toEqual(fullMoonOnlyResult("calendar"))
    createClient.mockImplementation((() => fakeClient({ id: "user-1" }, "full-moon")) as never)
    expect(await canUseFeature("calendar")).toEqual({ ok: true })
  })

  it("treats a missing session as needing an account", async () => {
    vi.stubEnv("MAJNU_BILLING", "")
    createClient.mockImplementation((() => fakeClient(null)) as never)
    expect(await canUseFeature("calendar")).toMatchObject({ ok: false, reason: "signin_required" })
  })
})

describe("signInRequiredResult", () => {
  it("is a kind sign-up prompt that promises guests keep what they made", () => {
    const result = signInRequiredResult()
    expect(result).toMatchObject({ ok: false, reason: "signin_required" })
    if (!result.ok) expect(result.message).toMatch(/comes with you/)
  })
})
