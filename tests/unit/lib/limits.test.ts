import { afterEach, describe, expect, it, vi } from "vitest"
import * as limits from "@/lib/limits"
import {
  LIMITS,
  calendarResult,
  canUseFeature,
  chatTurnsResult,
  countChatTurns,
  dailyLettersResult,
  signInRequiredResult,
  startOfUtcDay,
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

  it("lets real accounts make calendars and asks guests and visitors to sign up", () => {
    expect(calendarResult({ isAnonymous: false })).toEqual({ ok: true })
    expect(calendarResult({ isAnonymous: true })).toEqual(signInRequiredResult())
    expect(calendarResult(null)).toEqual(signInRequiredResult())
  })

  it("writes messages in the brand voice, without a plan or a price", () => {
    const results = [dailyLettersResult(9), chatTurnsResult(99), signInRequiredResult()]
    for (const result of results) {
      if (result.ok) throw new Error("expected a limit")
      expect(result.message).not.toMatch(/!|unlock|oops|magic/i)
      expect(result.message).not.toMatch(/full moon|subscription|plan|€/i)
      expect(result.message.length).toBeLessThan(200)
    }
  })

  it("has no plan gating left: no billing switch and no plan-only results", () => {
    expect(Object.keys(limits).sort()).toEqual(
      ["LIMITS", "calendarResult", "canCreateLetter", "canSendChatTurn", "canUseFeature", "chatTurnsResult", "countChatTurns", "dailyLettersResult", "signInRequiredResult", "startOfUtcDay"].sort(),
    )
  })
})

describe("UTC boundaries", () => {
  it("starts the day at UTC midnight", () => {
    const now = new Date("2026-11-21T23:59:59.999+05:00") // 18:59 UTC
    expect(startOfUtcDay(now).toISOString()).toBe("2026-11-21T00:00:00.000Z")
  })
})

// A client whose auth answers with `user` and whose database must never be read.
function fakeClient(user: { id: string; is_anonymous?: boolean } | null) {
  const from = vi.fn(() => {
    throw new Error("the database must not be touched")
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

  it("lets everyone use research and new gifts, without a database or auth call", async () => {
    for (const feature of ["research", "new_gift"] as const) {
      expect(await canUseFeature(feature)).toEqual({ ok: true })
    }
    expect(createClient).not.toHaveBeenCalled()
  })

  it("ignores the retired MAJNU_BILLING switch: nothing is gated on a plan", async () => {
    vi.stubEnv("MAJNU_BILLING", "on")
    for (const feature of ["research", "new_gift"] as const) {
      expect(await canUseFeature(feature)).toEqual({ ok: true })
    }
    const client = fakeClient({ id: "user-1", is_anonymous: false })
    createClient.mockImplementation((() => client) as never)
    expect(await canUseFeature("calendar")).toEqual({ ok: true })
    // No profile or plan is read.
    expect(client.from).not.toHaveBeenCalled()
  })

  it("lets a real user make a calendar, reading no table", async () => {
    const client = fakeClient({ id: "user-1", is_anonymous: false })
    createClient.mockImplementation((() => client) as never)
    expect(await canUseFeature("calendar")).toEqual({ ok: true })
    expect(client.from).not.toHaveBeenCalled()
  })

  it("asks a guest to sign up before a calendar", async () => {
    createClient.mockImplementation((() => fakeClient({ id: "guest-1", is_anonymous: true })) as never)
    expect(await canUseFeature("calendar")).toEqual(signInRequiredResult())
  })

  it("treats a missing session as needing an account", async () => {
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
