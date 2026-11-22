import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/admin", async () => {
  const { fakeClient } = await import("./fake-db")
  return { createAdminClient: () => fakeClient }
})
// Sessions are listed with the visitor's own client (row-level security).
vi.mock("@/lib/supabase/server", async () => {
  const { fakeClient } = await import("./fake-db")
  return { createClient: async () => fakeClient }
})

import {
  canSearch,
  canStartSession,
  claimSearch,
  dailySearchCap,
  DEFAULT_DAILY_SEARCH_CAP,
  findOpenSession,
  FINDER_LIMITS,
  releaseSearch,
  searchLimitResult,
  sessionMessagesResult,
  startSessionResult,
  type SearchCounts,
} from "@/lib/finder/limits"
import { fakeDb, resetFakeDb } from "./fake-db"

const NOW = new Date("2026-11-21T15:00:00Z")
const ME = "user-me"
const TODAY = "2026-11-21T08:00:00.000Z"
const YESTERDAY = "2026-11-20T23:59:00.000Z"

const searches = () => fakeDb.tables.finder_searches
const mine = () => searches().filter((row) => row.owner_id === ME)

function addSearch(sessionId: string | null, createdAt = TODAY, owner = ME, personalised = false) {
  searches().push({ id: fakeDb.nextId++, owner_id: owner, session_id: sessionId, personalised, created_at: createdAt })
}

const turn = { role: "user", content: [{ type: "text", text: "<context>…</context>" }, { type: "text", text: "Hi" }] }
const toolResult = { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "ok" }] }
const answer = { role: "assistant", content: [{ type: "text", text: "Gern." }] }
const chatOf = (messages: number) => Array.from({ length: messages }, () => [turn, answer, toolResult]).flat()

function addSession(id: string, opts: { createdAt?: string; messages?: number; calendar?: boolean; owner?: string } = {}) {
  fakeDb.tables.finder_sessions.push({
    id,
    owner_id: opts.owner ?? ME,
    created_at: opts.createdAt ?? TODAY,
    context: { language: "en", ...(opts.calendar ? { calendar: { letterId: "l" } } : {}) },
    timezone: "Europe/Berlin",
    chat: chatOf(opts.messages ?? 0),
    last_options: null,
  })
}

function claim(sessionId: string, opts: { personalised?: boolean; calendar?: boolean; language?: string } = {}) {
  return claimSearch({ ownerId: ME, sessionId, personalised: opts.personalised ?? false, now: NOW, language: opts.language ?? "en", calendar: opts.calendar })
}

beforeEach(() => {
  resetFakeDb(NOW)
  vi.stubEnv("MAJNU_DAILY_SEARCH_CAP", "")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("the finder's limits (issue #70)", () => {
  it("are 2 sessions a day, 10 searches a session and 30 messages a session", () => {
    expect(FINDER_LIMITS).toMatchObject({ sessionsPerDay: 2, searchesPerSession: 10, messagesPerSession: 30 })
    expect(FINDER_LIMITS).not.toHaveProperty("personalisedPerDay")
  })
})

describe("searchLimitResult", () => {
  const cap = 300
  const counts = (c: Partial<SearchCounts>): SearchCounts => ({ session: 0, sessionToday: 0, otherSessions: 0, site: 0, ...c })

  it("allows 10 searches in a session, personalised or not", () => {
    expect(searchLimitResult(counts({ session: 9, sessionToday: 9 }), {}, cap, "en")).toEqual({ ok: true })
    expect(searchLimitResult(counts({ session: 10, sessionToday: 10 }), {}, cap, "en")).toMatchObject({ ok: false, reason: "session_full" })
  })

  it("says to start a new search while one of today's two is left, and to come back tomorrow when not", () => {
    const full = searchLimitResult(counts({ session: 10, sessionToday: 10 }), {}, cap, "en")
    expect(full).toMatchObject({ reason: "session_full", message: expect.stringContaining("start a new search") })
    const bothUsed = searchLimitResult(counts({ session: 10, sessionToday: 4, otherSessions: 1 }), {}, cap, "en")
    expect(bothUsed).toMatchObject({ reason: "finder_daily", message: expect.stringContaining("come back tomorrow") })
    expect(bothUsed.ok ? "" : bothUsed.message).toContain("Choose one of the ideas you found")
  })

  it("counts a session from its first search: a third session may not start searching", () => {
    expect(searchLimitResult(counts({ otherSessions: 1 }), {}, cap, "en")).toEqual({ ok: true })
    expect(searchLimitResult(counts({ otherSessions: 2 }), {}, cap, "en")).toMatchObject({ ok: false, reason: "finder_daily" })
  })

  it("lets a session that already searched today keep going", () => {
    expect(searchLimitResult(counts({ session: 3, sessionToday: 3, otherSessions: 1 }), {}, cap, "en")).toEqual({ ok: true })
    // One that searched only on an earlier day counts again today.
    expect(searchLimitResult(counts({ session: 3, sessionToday: 0, otherSessions: 2 }), {}, cap, "en")).toMatchObject({ reason: "finder_daily" })
  })

  it("keeps calendars out of the finder's two sessions, with the same 10 searches each", () => {
    expect(searchLimitResult(counts({ otherSessions: 2 }), { calendar: true }, cap, "en")).toEqual({ ok: true })
    const full = searchLimitResult(counts({ session: 10 }), { calendar: true }, cap, "en")
    expect(full).toMatchObject({ ok: false, reason: "finder_daily", message: expect.stringContaining("calendar") })
  })

  it("stops everyone at the site-wide cap, after the visitor's own limits", () => {
    expect(searchLimitResult(counts({ site: 300 }), {}, cap, "en")).toMatchObject({ ok: false, reason: "site_busy" })
    expect(searchLimitResult(counts({ site: 300, otherSessions: 2 }), {}, cap, "en")).toMatchObject({ reason: "finder_daily" })
  })

  it("refuses kindly, in German for German visitors", () => {
    const en = searchLimitResult(counts({ otherSessions: 2 }), {}, cap, "en")
    const de = searchLimitResult(counts({ otherSessions: 2 }), {}, cap, "de")
    expect(en).toMatchObject({ message: expect.stringContaining("today's 2 gift searches") })
    expect(de).toMatchObject({ message: expect.stringContaining("2 Geschenksuchen") })
    for (const result of [en, de, searchLimitResult(counts({ session: 10, sessionToday: 1 }), {}, cap, "de")]) {
      expect(result.ok ? "" : result.message).not.toContain("!")
    }
  })
})

describe("dailySearchCap", () => {
  it("reads MAJNU_DAILY_SEARCH_CAP, defaulting to 300", () => {
    expect(dailySearchCap()).toBe(DEFAULT_DAILY_SEARCH_CAP)
    expect(DEFAULT_DAILY_SEARCH_CAP).toBe(300)
    vi.stubEnv("MAJNU_DAILY_SEARCH_CAP", "50")
    expect(dailySearchCap()).toBe(50)
    vi.stubEnv("MAJNU_DAILY_SEARCH_CAP", "0")
    expect(dailySearchCap()).toBe(0)
    vi.stubEnv("MAJNU_DAILY_SEARCH_CAP", "lots")
    expect(dailySearchCap()).toBe(300)
  })
})

describe("claimSearch", () => {
  beforeEach(() => {
    for (const id of ["s1", "s2", "s3"]) addSession(id)
    addSession("cal", { calendar: true })
  })

  it("records the search with its session and allows 10 in one session, personalised or not", async () => {
    for (let i = 0; i < FINDER_LIMITS.searchesPerSession; i++) expect((await claim("s1", { personalised: i % 2 === 1 })).ok).toBe(true)
    expect(mine()).toHaveLength(10)
    expect(searches().at(-1)).toMatchObject({ owner_id: ME, session_id: "s1", personalised: true })

    expect(await claim("s1")).toMatchObject({ ok: false, reason: "session_full" })
    expect(mine()).toHaveLength(10)
  })

  it("allows a second session, refuses a third, and lets both of today's go on", async () => {
    expect((await claim("s1")).ok).toBe(true)
    expect((await claim("s2")).ok).toBe(true)
    expect(await claim("s3")).toMatchObject({ ok: false, reason: "finder_daily" })
    expect(mine()).toHaveLength(2)
    expect((await claim("s1", { personalised: true })).ok).toBe(true)
    expect((await claim("s2", { personalised: true })).ok).toBe(true)
  })

  it("does not count yesterday's sessions, other visitors' or calendars", async () => {
    addSearch("old-1", YESTERDAY)
    addSearch("old-2", YESTERDAY)
    addSearch("theirs-1", TODAY, "someone-else")
    addSearch("theirs-2", TODAY, "someone-else")
    expect((await claim("cal", { calendar: true })).ok).toBe(true)
    expect((await claim("s1")).ok).toBe(true)
    expect((await claim("s2")).ok).toBe(true)
  })

  it("refuses everyone once the site-wide cap is reached", async () => {
    vi.stubEnv("MAJNU_DAILY_SEARCH_CAP", "2")
    addSearch("a", TODAY, "a")
    addSearch("b", TODAY, "b")
    expect(await claim("s1")).toMatchObject({ ok: false, reason: "site_busy" })
    expect(mine()).toHaveLength(0)
  })

  it("never lets two sessions start searching at the same moment past the limit", async () => {
    expect((await claim("s1")).ok).toBe(true)
    const results = await Promise.all([claim("s2"), claim("s3")])
    expect(results.filter((r) => r.ok).length).toBeLessThanOrEqual(1)
    expect(mine()).toHaveLength(1 + results.filter((r) => r.ok).length)
  })

  it("takes the row back out when counting fails, and throws", async () => {
    fakeDb.failNextRead = true
    await expect(claim("s1")).rejects.toThrow(/Could not count/)
    expect(mine()).toHaveLength(0)
  })
})

describe("releaseSearch", () => {
  it("deletes the claimed row", async () => {
    addSession("s1")
    const result = await claim("s1")
    expect(result.ok).toBe(true)
    await releaseSearch(result.ok ? result.claimId : -1)
    expect(mine()).toHaveLength(0)
  })
})

describe("before searching", () => {
  it("canSearch checks the session without recording anything", async () => {
    addSession("s1")
    for (let i = 0; i < 10; i++) addSearch("s1")
    expect(await canSearch(ME, "s1", NOW, "en")).toMatchObject({ ok: false, reason: "session_full" })
    expect(await canSearch(ME, "s2", NOW, "en")).toEqual({ ok: true })
    expect(mine()).toHaveLength(10)
  })

  it("canStartSession allows a new session while fewer than 2 have searched today", async () => {
    expect(await canStartSession(ME, NOW, "en")).toEqual({ ok: true })
    addSession("s1")
    addSearch("s1")
    expect(await canStartSession(ME, NOW, "en")).toEqual({ ok: true })
    addSession("s2")
    addSearch("s2")
    expect(await canStartSession(ME, NOW, "en")).toMatchObject({ ok: false, reason: "finder_daily" })
  })

  it("does not count a session that never searched (issue #70)", async () => {
    // Opened, chatted, never searched: none of them uses up one of the day's two.
    for (const id of ["e1", "e2", "e3"]) addSession(id, { messages: 2 })
    expect(await canStartSession(ME, NOW, "en")).toEqual({ ok: true })
    expect((await claim("e1")).ok).toBe(true)
    expect((await claim("e2")).ok).toBe(true)
  })

  it("still stops a script that starts sessions without end", () => {
    expect(startSessionResult(FINDER_LIMITS.sessionsStartedPerDay - 1, 0, 0, 300, "en")).toEqual({ ok: true })
    expect(startSessionResult(FINDER_LIMITS.sessionsStartedPerDay, 0, 0, 300, "de")).toMatchObject({
      ok: false,
      reason: "finder_daily",
      message: expect.stringContaining("Morgen"),
    })
  })

  it("limits the messages in one session to 30", () => {
    expect(sessionMessagesResult(chatOf(FINDER_LIMITS.messagesPerSession - 1), "en")).toEqual({ ok: true })
    expect(sessionMessagesResult(chatOf(FINDER_LIMITS.messagesPerSession), "en")).toMatchObject({ ok: false, reason: "session_full" })
  })
})

describe("continuing today's open session (reload, or the finder opened again)", () => {
  it("continues the newest session of today that has searches and messages left", async () => {
    addSession("morning", { createdAt: "2026-11-21T07:00:00.000Z", messages: 3 })
    addSession("noon", { createdAt: "2026-11-21T12:00:00.000Z", messages: 1 })
    addSearch("noon")
    expect((await findOpenSession(ME, NOW))?.id).toBe("noon")
  })

  it("continues a session that has not searched yet, so opening the finder twice costs nothing", async () => {
    addSession("empty", { messages: 0 })
    expect((await findOpenSession(ME, NOW))?.id).toBe("empty")
  })

  it("skips a session with no searches or messages left, yesterday's, other visitors' and calendars", async () => {
    addSession("older", { createdAt: "2026-11-21T06:00:00.000Z", messages: 2 })
    addSession("searched-out", { createdAt: "2026-11-21T09:00:00.000Z" })
    for (let i = 0; i < 10; i++) addSearch("searched-out")
    addSession("talked-out", { createdAt: "2026-11-21T10:00:00.000Z", messages: FINDER_LIMITS.messagesPerSession })
    addSession("calendar", { createdAt: "2026-11-21T11:00:00.000Z", calendar: true })
    addSession("theirs", { createdAt: "2026-11-21T11:30:00.000Z", owner: "someone-else" })
    addSession("yesterday", { createdAt: YESTERDAY })
    expect((await findOpenSession(ME, NOW))?.id).toBe("older")
  })

  it("finds none when every session today is spent", async () => {
    addSession("spent")
    for (let i = 0; i < 10; i++) addSearch("spent")
    expect(await findOpenSession(ME, NOW)).toBeNull()
  })
})
