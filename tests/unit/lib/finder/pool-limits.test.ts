import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// An in-memory stand-in for the service-role client, enough for the claims
// (finder_searches) and the calendar marker check (finder_sessions).
type Row = Record<string, unknown>
const db: Record<string, Row[]> = { finder_searches: [], finder_sessions: [] }
let nextId = 1
const NOW = new Date("2026-11-22T15:00:00Z")

function valueAt(row: Row, column: string): unknown {
  // "context->calendar": one level into a JSON column is all these queries use.
  const [col, key] = column.split("->")
  return key ? (row[col] as Record<string, unknown> | undefined)?.[key] : row[col]
}

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
      filters.push((row) => valueAt(row, column) === value)
      return builder
    },
    gte(column: string, value: string) {
      filters.push((row) => String(valueAt(row, column)) >= value)
      return builder
    },
    in(column: string, values: unknown[]) {
      filters.push((row) => values.includes(valueAt(row, column)))
      return builder
    },
    not(column: string, operator: string, value: unknown) {
      if (operator !== "is" || value !== null) throw new Error("unsupported filter")
      filters.push((row) => valueAt(row, column) !== undefined && valueAt(row, column) !== null)
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
      return resolve(head ? { data: null, count: matching.length, error: null } : { data: matching, count: null, error: null })
    },
  }
  return builder
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: query }) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { FINDER_LIMITS } from "@/lib/finder/limits"
import { claimMoreLikeThis, claimPool, countPoolsToday, poolLimitResult, POOLS_PER_DAY } from "@/lib/finder/pool-limits"

const ME = "user-me"
const CAL_A = "cal-session-a"
const CAL_B = "cal-session-b"
const CAL_C = "cal-session-c"
const FINDER = "finder-session"

beforeEach(() => {
  nextId = 1
  db.finder_searches = []
  db.finder_sessions = [
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
    expect(db.finder_searches).toEqual([expect.objectContaining({ owner_id: ME, session_id: CAL_A, personalised: false })])
    expect(await countPoolsToday(ME, NOW)).toBe(1)
  })

  it("refuses a third pool and gives its search back", async () => {
    expect((await claim(CAL_A)).ok).toBe(true)
    expect((await claim(CAL_B)).ok).toBe(true)
    const third = await claim(CAL_C)
    expect(third.ok).toBe(false)
    if (!third.ok) expect(third.message).toContain("calendars")
    expect(db.finder_searches).toHaveLength(2)
  })

  it("does not count the finder's own searches as pools, but they share the daily searches", async () => {
    db.finder_searches.push({ id: 90, owner_id: ME, session_id: FINDER, personalised: false, created_at: NOW.toISOString() })
    db.finder_searches.push({ id: 91, owner_id: ME, session_id: FINDER, personalised: false, created_at: NOW.toISOString() })
    expect(await countPoolsToday(ME, NOW)).toBe(0)
    expect((await claim(CAL_A)).ok).toBe(true)
    // 3 searches a day in all: the next pool is refused by the finder's own limit.
    const next = await claim(CAL_B)
    expect(next.ok).toBe(false)
    if (!next.ok) expect(next.message).toContain(`${FINDER_LIMITS.searchesPerDay} times today`)
    expect(db.finder_searches).toHaveLength(3)
  })

  it("ignores pools from earlier days", async () => {
    db.finder_searches.push({ id: 80, owner_id: ME, session_id: CAL_A, personalised: false, created_at: "2026-11-21T20:00:00Z" })
    db.finder_searches.push({ id: 81, owner_id: ME, session_id: CAL_B, personalised: false, created_at: "2026-11-21T21:00:00Z" })
    expect((await claim(CAL_C)).ok).toBe(true)
  })

  it("respects the site-wide cap", async () => {
    process.env.MAJNU_DAILY_SEARCH_CAP = "1"
    db.finder_searches.push({ id: 70, owner_id: "someone-else", session_id: null, personalised: false, created_at: NOW.toISOString() })
    const refused = await claim(CAL_A)
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.reason).toBe("site_busy")
    expect(db.finder_searches).toHaveLength(1)
  })
})

describe("claimMoreLikeThis", () => {
  it("is a personalised search in the calendar's session and not a pool", async () => {
    expect((await claimMoreLikeThis({ ownerId: ME, sessionId: CAL_A, now: NOW, language: "en" })).ok).toBe(true)
    expect(db.finder_searches).toEqual([expect.objectContaining({ session_id: CAL_A, personalised: true })])
    expect(await countPoolsToday(ME, NOW)).toBe(0)
  })

  it("stops after the finder's personalised searches for the day", async () => {
    for (let i = 0; i < FINDER_LIMITS.personalisedPerDay; i++) {
      expect((await claimMoreLikeThis({ ownerId: ME, sessionId: CAL_A, now: NOW, language: "en" })).ok).toBe(true)
    }
    const refused = await claimMoreLikeThis({ ownerId: ME, sessionId: CAL_A, now: NOW, language: "en" })
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.reason).toBe("personalise_daily")
  })
})
