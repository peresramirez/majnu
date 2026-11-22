import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// An in-memory finder_sessions table behind the service-role client, with the
// JSON paths PostgREST understands in filters ("context->profile->>readAt").
type Row = Record<string, unknown>
let rows: Row[] = []
const queries: { method: string; args: unknown[] }[] = []
let failCount = false

function valueAt(row: Row, column: string): unknown {
  const [first, ...rest] = column.split(/->>?/)
  let value: unknown = row[first]
  for (const key of rest) value = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined
  // ->> reads the value as text, as PostgREST does.
  if (column.includes("->>") && value !== undefined && value !== null) return String(value)
  return value ?? null
}

// What a stored context holds for the visitor and the server, without the revision.
function withoutRev(context: unknown): unknown {
  const { rev: _rev, ...rest } = context as Row
  void _rev
  return rest
}

function query() {
  const filters: ((row: Row) => boolean)[] = []
  let update: Row | null = null
  let head = false
  let single = false
  // "profiles:context->profiles": the rows come back as { profiles: <that value> }.
  let alias: [string, string] | null = null
  const builder = {
    select(columns?: string, options?: { head?: boolean }) {
      head = options?.head === true
      const match = columns?.match(/^(\w+):(.+)$/)
      alias = match ? [match[1], match[2]] : null
      return builder
    },
    update(values: Row) {
      queries.push({ method: "update", args: [values] })
      update = values
      return builder
    },
    eq(column: string, value: unknown) {
      queries.push({ method: "eq", args: [column, value] })
      filters.push((row) => valueAt(row, column) === value)
      return builder
    },
    is(column: string, value: null) {
      queries.push({ method: "is", args: [column, value] })
      filters.push((row) => valueAt(row, column) === value)
      return builder
    },
    gte(column: string, value: string) {
      queries.push({ method: "gte", args: [column, value] })
      filters.push((row) => valueAt(row, column) !== null && String(valueAt(row, column)) >= value)
      return builder
    },
    in(column: string, values: unknown[]) {
      queries.push({ method: "in", args: [column, values] })
      filters.push((row) => values.includes(valueAt(row, column)))
      return builder
    },
    maybeSingle() {
      single = true
      return builder
    },
    then(resolve: (value: unknown) => void) {
      const matching = rows.filter((row) => filters.every((f) => f(row)))
      if (update) {
        for (const row of matching) Object.assign(row, structuredClone(update))
        return resolve({ data: matching[0] ? { id: matching[0].id } : null, error: null })
      }
      if (single) return resolve({ data: matching[0] ? structuredClone(matching[0]) : null, error: null })
      // Only the counts fail: the session's own row still loads.
      if (failCount && head) {
        failCount = false
        return resolve({ data: null, count: null, error: { message: "connection reset" } })
      }
      if (head) return resolve({ data: null, count: matching.length, error: null })
      const data = alias ? matching.map((row) => ({ [alias![0]]: valueAt(row, alias![1]) })) : matching
      return resolve({ data: structuredClone(data), error: null })
    },
  }
  return builder
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => query() }) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import {
  apifyDailyCap,
  claimProfileAttempt,
  claimProfileRead,
  DEFAULT_APIFY_DAILY_CAP,
  finishProfileAttempt,
  PROFILE_LIMITS,
} from "@/lib/finder/limits"
import { parseContext, parseProfile, parseProfiles, saveFinderSession, storedContext, type ProfileAttempt } from "@/lib/finder/sessions"

const NOW = new Date("2026-11-21T15:00:00Z")
const CONTEXT = { country: "DE", language: "de", currency: "EUR" }
const SESSION = { id: "session-1", ownerId: "user-1" }

function addSession(id: string, profile?: Row, ownerId = "someone") {
  rows.push({ id, owner_id: ownerId, context: { ...CONTEXT, ...(profile ? { profile } : {}) } })
}

function claim(source: "instagram" | "tiktok" | "linkedin" | "web" = "instagram") {
  return claimProfileRead({ session: SESSION, context: CONTEXT, source, now: NOW })
}

beforeEach(() => {
  rows = []
  queries.length = 0
  failCount = false
  vi.stubEnv("APIFY_DAILY_CAP", "")
  addSession("session-1", undefined, "user-1")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("apifyDailyCap", () => {
  it("defaults to 20, accepts whole numbers and 0, and ignores anything else", () => {
    expect(apifyDailyCap()).toBe(DEFAULT_APIFY_DAILY_CAP)
    expect(DEFAULT_APIFY_DAILY_CAP).toBe(20)
    vi.stubEnv("APIFY_DAILY_CAP", "5")
    expect(apifyDailyCap()).toBe(5)
    vi.stubEnv("APIFY_DAILY_CAP", "0")
    expect(apifyDailyCap()).toBe(0)
    for (const bad of ["-1", "2.5", "lots"]) {
      vi.stubEnv("APIFY_DAILY_CAP", bad)
      expect(apifyDailyCap()).toBe(DEFAULT_APIFY_DAILY_CAP)
    }
  })
})

describe("claimProfileRead", () => {
  it("records the read on the session, inside its context, in one conditional update", async () => {
    const result = await claim()
    expect(result).toEqual({ ok: true, profile: { source: "instagram", readAt: NOW.toISOString(), interests: [] } })
    expect(withoutRev(rows[0].context)).toEqual({ ...CONTEXT, profile: { source: "instagram", readAt: NOW.toISOString(), interests: [] } })
    // Written only if no other write came in between.
    expect(queries).toContainEqual({ method: "is", args: ["context->rev", null] })
    expect(queries).toContainEqual({ method: "eq", args: ["owner_id", "user-1"] })
  })

  it("allows one read per session, also for two messages at the same moment", async () => {
    const [first, second] = await Promise.all([claim(), claim("tiktok")])
    expect([first.ok, second.ok].sort()).toEqual([false, true])
    expect(first.ok ? second : first).toEqual({ ok: false, reason: "session" })
    expect(await claim("web")).toEqual({ ok: false, reason: "session" })
  })

  it("counts Instagram and TikTok reads site-wide since midnight UTC against APIFY_DAILY_CAP", async () => {
    vi.stubEnv("APIFY_DAILY_CAP", "2")
    addSession("a", { source: "instagram", readAt: "2026-11-21T08:00:00.000Z", interests: ["Kaffee"] })
    addSession("b", { source: "tiktok", readAt: "2026-11-20T23:59:00.000Z", interests: [] }) // yesterday
    addSession("c", { source: "web", readAt: "2026-11-21T09:00:00.000Z", interests: [] }) // not Apify
    expect(await claim()).toMatchObject({ ok: true })
    expect(queries).toContainEqual({ method: "gte", args: ["context->profile->>readAt", "2026-11-21T00:00:00.000Z"] })
    expect(queries).toContainEqual({ method: "in", args: ["context->profile->>source", ["instagram", "tiktok", "linkedin"]] })
  })

  it("counts LinkedIn reads (Bright Data, paid per record) against the same cap, both ways", async () => {
    vi.stubEnv("APIFY_DAILY_CAP", "2")
    addSession("a", { source: "linkedin", readAt: "2026-11-21T08:00:00.000Z", interests: [] })
    addSession("b", { source: "instagram", readAt: "2026-11-21T09:00:00.000Z", interests: [] })
    // Two paid reads today: a third, Instagram or LinkedIn, is refused and its record taken back.
    expect(await claim("linkedin")).toEqual({ ok: false, reason: "daily_cap" })
    expect(withoutRev(rows[0].context)).toEqual(CONTEXT)
    expect(await claim("instagram")).toEqual({ ok: false, reason: "daily_cap" })

    vi.stubEnv("APIFY_DAILY_CAP", "3")
    expect(await claim("linkedin")).toEqual({ ok: true, profile: { source: "linkedin", readAt: NOW.toISOString(), interests: [] } })
    vi.stubEnv("APIFY_DAILY_CAP", "0")
    rows[0].context = CONTEXT
    expect(await claim("linkedin")).toEqual({ ok: false, reason: "daily_cap" })
  })

  it("refuses at the cap and takes its own record back", async () => {
    vi.stubEnv("APIFY_DAILY_CAP", "2")
    addSession("a", { source: "instagram", readAt: "2026-11-21T08:00:00.000Z", interests: [] })
    addSession("b", { source: "tiktok", readAt: "2026-11-21T09:00:00.000Z", interests: [] })
    expect(await claim()).toEqual({ ok: false, reason: "daily_cap" })
    expect(withoutRev(rows[0].context)).toEqual(CONTEXT)
    // Other pages are read with Tavily and do not count against the Apify cap.
    expect(await claim("web")).toMatchObject({ ok: true })
  })

  it("reads nothing with Apify when the cap is 0", async () => {
    vi.stubEnv("APIFY_DAILY_CAP", "0")
    expect(await claim("tiktok")).toEqual({ ok: false, reason: "daily_cap" })
    expect(queries.filter((q) => q.method === "update")).toHaveLength(0)
  })

  it("takes the record back and throws when the count fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    failCount = true
    await expect(claim()).rejects.toThrow("Could not count today's profile reads")
    expect(withoutRev(rows[0].context)).toEqual(CONTEXT)
  })
})

describe("the calendar's one read in a stored session", () => {
  const profile = { source: "tiktok" as const, readAt: NOW.toISOString(), interests: ["Bouldern", "Kaffee"] }

  it("is read back for the server and never reaches the visitor-facing context", () => {
    const stored = { ...CONTEXT, interests: ["Bouldern"], profile }
    expect(parseProfile(stored)).toEqual(profile)
    expect(parseContext(stored)).toEqual({ ...CONTEXT, interests: ["Bouldern"] })
    expect(parseProfile(CONTEXT)).toBeNull()
    expect(parseProfile({ profile: { source: "facebook", readAt: "x" } })).toBeNull()
    expect(parseProfile(null)).toBeNull()
    expect(storedContext(CONTEXT, null)).toEqual(CONTEXT)
  })
})

// ---------- Several reads per session (issue #89) ----------

const LATER = new Date("2026-11-21T15:05:00Z")

function attempt(key: string, source: "instagram" | "tiktok" | "linkedin" | "web" = "linkedin", now = NOW) {
  return claimProfileAttempt({ session: SESSION, source, key, now })
}

function storedReads() {
  return parseProfiles(rows[0].context)
}

async function failed(key: string, now = NOW) {
  const claim = await attempt(key, "linkedin", now)
  if (!claim.ok) throw new Error(`refused: ${claim.reason}`)
  await finishProfileAttempt(SESSION, claim.attempt, { ok: false, reason: "not_found" })
  return claim.attempt
}

async function succeeded(key: string, interests: string[], now = NOW) {
  const claim = await attempt(key, "instagram", now)
  if (!claim.ok) throw new Error(`refused: ${claim.reason}`)
  await finishProfileAttempt(SESSION, claim.attempt, { ok: true, interests })
  return claim.attempt
}

describe("claimProfileAttempt", () => {
  it("lets a failed read be followed by a successful one in the same session", async () => {
    await failed("typo")
    expect(storedReads().reads).toEqual([expect.objectContaining({ key: "typo", status: "failed", reason: "not_found", interests: [] })])
    await succeeded("fixed", ["Bouldern"], LATER)
    expect(storedReads()).toMatchObject({ day: "2026-11-21", paid: 2, reads: [{ status: "failed" }, { key: "fixed", status: "read", interests: ["Bouldern"] }] })
  })

  it("keeps two profiles' interests on the session, and tries each link once", async () => {
    await succeeded("a", ["Bouldern", "Kaffee"])
    await succeeded("b", ["Jazz"], LATER)
    expect(storedReads().reads.map((r) => r.interests)).toEqual([["Bouldern", "Kaffee"], ["Jazz"]])
    const again = await attempt("a", "instagram", LATER)
    expect(again).toMatchObject({ ok: false, reason: "same_link", previous: { key: "a", status: "read", interests: ["Bouldern", "Kaffee"] } })
    // A failed link is not tried again either.
    await failed("c", LATER)
    expect(await attempt("c")).toMatchObject({ ok: false, reason: "same_link", previous: { status: "failed", reason: "not_found" } })
  })

  it("stops at 5 reads and 8 attempts in a session", async () => {
    expect(PROFILE_LIMITS).toEqual({ readsPerSession: 5, attemptsPerSession: 8 })
    vi.stubEnv("APIFY_DAILY_CAP", "100")
    for (let i = 0; i < 5; i++) await succeeded(`ok-${i}`, ["X"])
    expect(await attempt("sixth")).toEqual({ ok: false, reason: "session_reads" })

    rows[0].context = CONTEXT
    for (let i = 0; i < 7; i++) await failed(`bad-${i}`)
    await succeeded("last", ["X"])
    expect(await attempt("ninth")).toEqual({ ok: false, reason: "session_attempts" })
    expect(storedReads().reads).toHaveLength(8)
  })

  it("claims the site's daily paid cap on every attempt, failed ones included", async () => {
    vi.stubEnv("APIFY_DAILY_CAP", "3")
    addSession("other", undefined)
    rows[1].context = { ...CONTEXT, profiles: { day: "2026-11-21", paid: 1, reads: [] } }
    await failed("one")
    await failed("two")
    // 1 elsewhere + 2 failed here: the cap is reached, and the refused claim is taken back.
    expect(await attempt("three")).toEqual({ ok: false, reason: "daily_cap" })
    expect(storedReads()).toMatchObject({ paid: 2 })
    expect(storedReads().reads).toHaveLength(2)
    // Tavily pages are not paid and still read.
    expect(await attempt("page", "web")).toMatchObject({ ok: true })
    expect(storedReads()).toMatchObject({ paid: 2 })
    // Yesterday's paid attempts don't count today.
    rows[1].context = { ...CONTEXT, profiles: { day: "2026-11-20", paid: 5, reads: [] } }
    expect(await attempt("three")).toMatchObject({ ok: true })
  })

  it("counts sessions saved before issue #89 and calendars' one read against the same cap", async () => {
    vi.stubEnv("APIFY_DAILY_CAP", "2")
    addSession("legacy", { source: "instagram", readAt: "2026-11-21T08:00:00.000Z", interests: [] })
    addSession("calendar", { source: "linkedin", readAt: "2026-11-21T09:00:00.000Z", interests: ["Kaffee"] })
    expect(await attempt("x")).toEqual({ ok: false, reason: "daily_cap" })
    expect(storedReads().reads).toEqual([])
  })

  it("never lets two attempts at the same moment past the cap, in one session or two", async () => {
    vi.stubEnv("APIFY_DAILY_CAP", "1")
    addSession("session-2", undefined, "user-2")
    const [mine, theirs] = await Promise.all([
      attempt("a"),
      claimProfileAttempt({ session: { id: "session-2", ownerId: "user-2" }, source: "tiktok", key: "b", now: NOW }),
    ])
    expect([mine, theirs].filter((claim) => claim.ok).length).toBeLessThanOrEqual(1)
    const paid = rows.reduce((sum, row) => sum + parseProfiles(row.context).paid, 0)
    expect(paid).toBeLessThanOrEqual(1)

    // One session at 7 attempts: of two at the same moment, exactly one gets the 8th.
    vi.stubEnv("APIFY_DAILY_CAP", "100")
    rows[0].context = CONTEXT
    for (let i = 0; i < 7; i++) await failed(`bad-${i}`)
    const both = await Promise.all([attempt("p"), attempt("q")])
    expect(both.filter((claim) => claim.ok)).toHaveLength(1)
    expect(both.find((claim) => !claim.ok)).toEqual({ ok: false, reason: "session_attempts" })
    expect(storedReads().reads).toHaveLength(8)
  })

  it("records a failed attempt without wiping the rest of the context", async () => {
    rows[0].context = { ...CONTEXT, interests: ["Lesen"], uploads: { v: 1, total: 2, day: "2026-11-21", today: 2 }, rev: 4 }
    const claim = (await attempt("x")) as { ok: true; attempt: ProfileAttempt }
    // Another request saves a turn while the read runs.
    await saveFinderSession(SESSION, { chat: [], context: { ...CONTEXT, interests: ["Lesen", "Garten"] }, lastOptions: null })
    await finishProfileAttempt(SESSION, claim.attempt, { ok: false, reason: "private" })
    const context = rows[0].context as Row
    expect(context.uploads).toEqual({ v: 1, total: 2, day: "2026-11-21", today: 2 })
    expect(context.interests).toEqual(["Lesen", "Garten"])
    expect(storedReads().reads).toEqual([expect.objectContaining({ status: "failed", reason: "private" })])
  })

  it("keeps the session's attempts when a turn is saved", async () => {
    await succeeded("a", ["Bouldern"])
    await saveFinderSession(SESSION, { chat: [], context: CONTEXT, lastOptions: null })
    expect(storedReads().reads).toEqual([expect.objectContaining({ key: "a", status: "read" })])
    expect(parseContext(rows[0].context)).toEqual(CONTEXT)
  })
})

describe("sessions saved before issue #89", () => {
  const legacy = { source: "tiktok" as const, readAt: "2026-11-21T10:00:00.000Z", interests: ["Bouldern", "Kaffee"] }

  it("are still read: their one profile is one attempt", () => {
    expect(parseProfiles({ ...CONTEXT, profile: legacy })).toEqual({
      day: "2026-11-21",
      paid: 1,
      reads: [{ source: "tiktok", readAt: legacy.readAt, key: "", status: "read", interests: ["Bouldern", "Kaffee"] }],
    })
    expect(parseProfiles({ profile: { ...legacy, source: "web", interests: [] } })).toMatchObject({ paid: 0, reads: [{ status: "failed" }] })
    expect(parseProfiles(CONTEXT)).toEqual({ day: "", paid: 0, reads: [] })
    expect(parseProfiles(null)).toEqual({ day: "", paid: 0, reads: [] })
    expect(parseContext({ ...CONTEXT, profile: legacy })).toEqual(CONTEXT)
  })

  it("can read another profile, and the old one is folded into the list", async () => {
    rows[0].context = { ...CONTEXT, profile: legacy }
    expect(await attempt("new", "instagram")).toMatchObject({ ok: true })
    const context = rows[0].context as Row
    expect(context.profile).toBeUndefined()
    expect(storedReads()).toMatchObject({ day: "2026-11-21", paid: 2, reads: [{ source: "tiktok", status: "read" }, { key: "new", status: "claimed" }] })
  })
})
