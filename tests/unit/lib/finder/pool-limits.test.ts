import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

vi.mock("@/lib/supabase/admin", async () => {
  const { fakeClient } = await import("./fake-db")
  return { createAdminClient: () => fakeClient }
})
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { FINDER_LIMITS } from "@/lib/finder/limits"
import { claimMoreLikeThis, claimPool, countPoolsToday, poolLimitResult, POOLS_PER_DAY } from "@/lib/finder/pool-limits"
import { fakeDb, resetFakeDb } from "./fake-db"

const NOW = new Date("2026-11-22T15:00:00Z")

const ME = "user-me"
const CAL_A = "cal-session-a"
const CAL_B = "cal-session-b"
const CAL_C = "cal-session-c"
const FINDER = "finder-session"

beforeEach(() => {
  resetFakeDb(NOW)
  fakeDb.tables.finder_sessions = [
    { id: CAL_A, owner_id: ME, context: { language: "de", calendar: { letterId: "a" } } },
    { id: CAL_B, owner_id: ME, context: { language: "de", calendar: { letterId: "b" } } },
    { id: CAL_C, owner_id: ME, context: { language: "de", calendar: { letterId: "c" } } },
    { id: FINDER, owner_id: ME, context: { language: "de" } },
  ]
  delete process.env.MAJNU_DAILY_SEARCH_CAP
})

const claim = (sessionId: string) => claimPool({ ownerId: ME, sessionId, now: NOW, language: "en" })

describe("poolLimitResult", () => {
  it("allows two pools a day and says so kindly after that", () => {
    expect(POOLS_PER_DAY).toBe(2)
    expect(poolLimitResult(1, "en")).toEqual({ ok: true })
    const refused = poolLimitResult(2, "en")
    expect(refused.ok).toBe(false)
    if (!refused.ok) {
      expect(refused.reason).toBe("finder_daily")
      expect(refused.message).toContain("2 times today")
    }
    const german = poolLimitResult(2, "de-DE")
    expect(!german.ok && german.message).toContain("Kalender")
  })
})

describe("claimPool", () => {
  it("counts a pool as one plain finder search in the calendar's session", async () => {
    const first = await claim(CAL_A)
    expect(first.ok).toBe(true)
    expect(fakeDb.tables.finder_searches).toEqual([expect.objectContaining({ owner_id: ME, session_id: CAL_A, personalised: false })])
    expect(await countPoolsToday(ME, NOW)).toBe(1)
  })

  it("refuses a third pool and gives its search back", async () => {
    expect((await claim(CAL_A)).ok).toBe(true)
    expect((await claim(CAL_B)).ok).toBe(true)
    const third = await claim(CAL_C)
    expect(third.ok).toBe(false)
    if (!third.ok) expect(third.message).toContain("calendars")
    expect(fakeDb.tables.finder_searches).toHaveLength(2)
  })

  it("does not count the finder's own searches as pools, nor a calendar as one of the finder's two sessions (issue #70)", async () => {
    fakeDb.tables.finder_searches.push({ id: 90, owner_id: ME, session_id: FINDER, personalised: false, created_at: NOW.toISOString() })
    fakeDb.tables.finder_searches.push({ id: 91, owner_id: ME, session_id: "finder-2", personalised: false, created_at: NOW.toISOString() })
    fakeDb.tables.finder_sessions.push({ id: "finder-2", owner_id: ME, context: { language: "de" } })
    expect(await countPoolsToday(ME, NOW)).toBe(0)
    // Both of the finder's sessions searched today; calendars have their own two pools.
    expect((await claim(CAL_A)).ok).toBe(true)
    expect((await claim(CAL_B)).ok).toBe(true)
    expect(fakeDb.tables.finder_searches).toHaveLength(4)
  })

  it("ignores pools from earlier days", async () => {
    fakeDb.tables.finder_searches.push({ id: 80, owner_id: ME, session_id: CAL_A, personalised: false, created_at: "2026-11-21T20:00:00Z" })
    fakeDb.tables.finder_searches.push({ id: 81, owner_id: ME, session_id: CAL_B, personalised: false, created_at: "2026-11-21T21:00:00Z" })
    expect((await claim(CAL_C)).ok).toBe(true)
  })

  it("respects the site-wide cap", async () => {
    process.env.MAJNU_DAILY_SEARCH_CAP = "1"
    fakeDb.tables.finder_searches.push({ id: 70, owner_id: "someone-else", session_id: null, personalised: false, created_at: NOW.toISOString() })
    const refused = await claim(CAL_A)
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.reason).toBe("site_busy")
    expect(fakeDb.tables.finder_searches).toHaveLength(1)
  })
})

describe("claimMoreLikeThis", () => {
  it("is a personalised search in the calendar's session and not a pool", async () => {
    expect((await claimMoreLikeThis({ ownerId: ME, sessionId: CAL_A, now: NOW, language: "en" })).ok).toBe(true)
    expect(fakeDb.tables.finder_searches).toEqual([expect.objectContaining({ session_id: CAL_A, personalised: true })])
    expect(await countPoolsToday(ME, NOW)).toBe(0)
  })

  it("stops after 10 searches in the calendar's session, its pool included, with the calendar's own words", async () => {
    expect((await claim(CAL_A)).ok).toBe(true)
    for (let i = 1; i < FINDER_LIMITS.searchesPerSession; i++) {
      expect((await claimMoreLikeThis({ ownerId: ME, sessionId: CAL_A, now: NOW, language: "en" })).ok).toBe(true)
    }
    const refused = await claimMoreLikeThis({ ownerId: ME, sessionId: CAL_A, now: NOW, language: "en" })
    expect(refused.ok).toBe(false)
    if (!refused.ok) {
      // Never the finder's "start a new search": a calendar has one session.
      expect(refused.reason).toBe("finder_daily")
      expect(refused.message).toContain("this calendar")
    }
  })
})
