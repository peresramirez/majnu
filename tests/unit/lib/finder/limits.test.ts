import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// An in-memory stand-in for the service-role client: just enough of the query
// builder for finder_searches and finder_sessions.
type Row = Record<string, unknown>
const db: Record<string, Row[]> = { finder_searches: [], finder_sessions: [] }
let nextId = 1
let failNextCount = false
const NOW = new Date("2026-11-21T15:00:00Z")

function query(table: string) {
  const filters: ((row: Row) => boolean)[] = []
  let op: "select" | "insert" | "delete" = "select"
  let head = false
  let inserted: Row | null = null
  const builder = {
    select(_columns?: string, options?: { count?: string; head?: boolean }) {
      if (op !== "insert") head = options?.head === true
      return builder
    },
    insert(row: Row) {
      op = "insert"
      inserted = { id: nextId++, created_at: NOW.toISOString(), ...row }
      return builder
    },
    delete() {
      op = "delete"
      return builder
    },
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value)
      return builder
    },
    gte(column: string, value: string) {
      filters.push((row) => String(row[column]) >= value)
      return builder
    },
    single() {
      return builder
    },
    then(resolve: (value: unknown) => void) {
      const rows = db[table]
      if (op === "insert") {
        rows.push(inserted!)
        return resolve({ data: { id: inserted!.id }, error: null })
      }
      const matching = rows.filter((row) => filters.every((f) => f(row)))
      if (op === "delete") {
        db[table] = rows.filter((row) => !matching.includes(row))
        return resolve({ error: null })
      }
      if (failNextCount) {
        failNextCount = false
        return resolve({ data: null, count: null, error: { message: "connection reset" } })
      }
      return resolve(head ? { data: null, count: matching.length, error: null } : { data: matching, count: null, error: null })
    },
  }
  return builder
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: query }) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import {
  canSearch,
  canStartSession,
  claimSearch,
  dailySearchCap,
  DEFAULT_DAILY_SEARCH_CAP,
  FINDER_LIMITS,
  releaseSearch,
  searchLimitResult,
  sessionMessagesResult,
  sessionsResult,
} from "@/lib/finder/limits"

const ME = "user-me"
const TODAY = "2026-11-21T08:00:00.000Z"
const YESTERDAY = "2026-11-20T23:59:00.000Z"

function addSearch(owner: string, personalised: boolean, createdAt = TODAY) {
  db.finder_searches.push({ id: nextId++, owner_id: owner, session_id: "s", personalised, created_at: createdAt })
}

function claim(personalised: boolean, language = "en") {
  return claimSearch({ ownerId: ME, sessionId: "session-1", personalised, now: NOW, language })
}

beforeEach(() => {
  db.finder_searches = []
  db.finder_sessions = []
  nextId = 1
  failNextCount = false
  vi.stubEnv("MAJNU_DAILY_SEARCH_CAP", "")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("searchLimitResult", () => {
  const cap = 300

  it("allows 3 searches a day in total", () => {
    expect(searchLimitResult({ mine: 2, minePersonalised: 0, site: 0 }, false, cap, "en")).toEqual({ ok: true })
    expect(searchLimitResult({ mine: 3, minePersonalised: 0, site: 0 }, false, cap, "en")).toMatchObject({ ok: false, reason: "finder_daily" })
  })

  it("allows at most 2 of them to be personalised, even when the total allows more", () => {
    expect(searchLimitResult({ mine: 1, minePersonalised: 1, site: 0 }, true, cap, "en")).toEqual({ ok: true })
    expect(searchLimitResult({ mine: 2, minePersonalised: 2, site: 0 }, true, cap, "en")).toMatchObject({ ok: false, reason: "personalise_daily" })
    // A plain search is still allowed then.
    expect(searchLimitResult({ mine: 2, minePersonalised: 2, site: 0 }, false, cap, "en")).toEqual({ ok: true })
  })

  it("names the daily total first when both of the visitor's limits are reached", () => {
    expect(searchLimitResult({ mine: 3, minePersonalised: 2, site: 0 }, true, cap, "en")).toMatchObject({ reason: "finder_daily" })
  })

  it("stops everyone at the site-wide cap, after the visitor's own limits", () => {
    expect(searchLimitResult({ mine: 0, minePersonalised: 0, site: 300 }, false, cap, "en")).toMatchObject({ ok: false, reason: "site_busy" })
    expect(searchLimitResult({ mine: 3, minePersonalised: 0, site: 300 }, false, cap, "en")).toMatchObject({ reason: "finder_daily" })
  })

  it("refuses kindly, in German for German visitors", () => {
    const en = searchLimitResult({ mine: 3, minePersonalised: 0, site: 0 }, false, cap, "en")
    const de = searchLimitResult({ mine: 3, minePersonalised: 0, site: 0 }, false, cap, "de")
    expect(en).toMatchObject({ message: expect.stringContaining("3 times today") })
    expect(de).toMatchObject({ message: expect.stringContaining("3-mal") })
    for (const result of [en, de]) {
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
  it("records the search and allows the 3rd of the day", async () => {
    addSearch(ME, false)
    addSearch(ME, true)
    addSearch(ME, false, YESTERDAY)
    addSearch("someone-else", false)

    const result = await claim(true)
    expect(result).toEqual({ ok: true, claimId: expect.any(Number) })
    expect(db.finder_searches.filter((r) => r.owner_id === ME && String(r.created_at) >= TODAY)).toHaveLength(3)
    expect(db.finder_searches.at(-1)).toMatchObject({ owner_id: ME, session_id: "session-1", personalised: true })
  })

  it("refuses the 4th search of the day and takes its row back out", async () => {
    for (let i = 0; i < FINDER_LIMITS.searchesPerDay; i++) expect((await claim(i > 0)).ok).toBe(true)

    const fourth = await claim(false)
    expect(fourth).toMatchObject({ ok: false, reason: "finder_daily" })
    expect(db.finder_searches).toHaveLength(3)
  })

  it("refuses a 3rd personalised search even though the day's total allows one more", async () => {
    addSearch(ME, true)
    addSearch(ME, true)

    expect(await claim(true)).toMatchObject({ ok: false, reason: "personalise_daily" })
    expect(db.finder_searches).toHaveLength(2)
    expect(await claim(false)).toMatchObject({ ok: true })
  })

  it("refuses everyone once the site-wide cap is reached", async () => {
    vi.stubEnv("MAJNU_DAILY_SEARCH_CAP", "2")
    addSearch("a", false)
    addSearch("b", false)

    expect(await claim(false)).toMatchObject({ ok: false, reason: "site_busy" })
    expect(db.finder_searches).toHaveLength(2)
  })

  it("never lets two searches at the same moment past the limit", async () => {
    addSearch(ME, false)
    addSearch(ME, false)
    const results = await Promise.all([claim(false), claim(false)])
    expect(results.filter((r) => r.ok).length).toBeLessThanOrEqual(1)
    expect(db.finder_searches.filter((r) => r.owner_id === ME)).toHaveLength(2 + results.filter((r) => r.ok).length)
  })

  it("takes the row back out when counting fails, and throws", async () => {
    failNextCount = true
    await expect(claim(false)).rejects.toThrow("Could not count today's searches")
    expect(db.finder_searches).toHaveLength(0)
  })
})

describe("releaseSearch", () => {
  it("deletes the claimed row", async () => {
    const result = await claim(false)
    expect(result.ok).toBe(true)
    await releaseSearch(result.ok ? result.claimId : -1)
    expect(db.finder_searches).toHaveLength(0)
  })
})

describe("before searching", () => {
  it("canSearch checks without recording anything", async () => {
    addSearch(ME, true)
    addSearch(ME, true)
    expect(await canSearch(ME, true, NOW, "en")).toMatchObject({ ok: false, reason: "personalise_daily" })
    expect(await canSearch(ME, false, NOW, "en")).toEqual({ ok: true })
    expect(db.finder_searches).toHaveLength(2)
  })

  it("canStartSession needs a plain search left and fewer than 10 sessions today", async () => {
    expect(await canStartSession(ME, NOW, "en")).toEqual({ ok: true })

    for (let i = 0; i < FINDER_LIMITS.sessionsPerDay; i++) db.finder_sessions.push({ id: `s${i}`, owner_id: ME, created_at: TODAY })
    expect(await canStartSession(ME, NOW, "en")).toMatchObject({ ok: false, reason: "finder_daily" })

    db.finder_sessions = []
    for (let i = 0; i < 3; i++) addSearch(ME, false)
    expect(await canStartSession(ME, NOW, "en")).toMatchObject({ ok: false, reason: "finder_daily" })
  })

  it("limits the messages in one session to 20", () => {
    const turn = { role: "user", content: [{ type: "text", text: "<context>…</context>" }, { type: "text", text: "Hi" }] }
    const toolResult = { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "ok" }] }
    const chat = Array.from({ length: FINDER_LIMITS.messagesPerSession - 1 }, () => [turn, { role: "assistant", content: [] }, toolResult]).flat()
    expect(sessionMessagesResult(chat, "en")).toEqual({ ok: true })
    expect(sessionMessagesResult([...chat, turn], "en")).toMatchObject({ ok: false, reason: "finder_daily" })
  })

  it("limits sessions to 10 a day", () => {
    expect(sessionsResult(9, "en")).toEqual({ ok: true })
    expect(sessionsResult(10, "de")).toMatchObject({ ok: false, reason: "finder_daily", message: expect.stringContaining("Morgen") })
  })
})
