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
  return value ?? null
}

function query() {
  const filters: ((row: Row) => boolean)[] = []
  let update: Row | null = null
  let head = false
  const builder = {
    select(_columns?: string, options?: { head?: boolean }) {
      head = options?.head === true
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
      return builder
    },
    then(resolve: (value: unknown) => void) {
      const matching = rows.filter((row) => filters.every((f) => f(row)))
      if (update) {
        for (const row of matching) Object.assign(row, update)
        return resolve({ data: matching[0] ? { id: matching[0].id } : null, error: null })
      }
      if (failCount) {
        failCount = false
        return resolve({ data: null, count: null, error: { message: "connection reset" } })
      }
      return resolve(head ? { data: null, count: matching.length, error: null } : { data: matching, error: null })
    },
  }
  return builder
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => query() }) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { apifyDailyCap, claimProfileRead, DEFAULT_APIFY_DAILY_CAP } from "@/lib/finder/limits"
import { parseContext, parseProfile, saveFinderSession, storedContext } from "@/lib/finder/sessions"

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
    expect(rows[0].context).toEqual({ ...CONTEXT, profile: { source: "instagram", readAt: NOW.toISOString(), interests: [] } })
    expect(queries).toContainEqual({ method: "is", args: ["context->profile", null] })
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
    expect(rows[0].context).toEqual(CONTEXT)
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
    expect(rows[0].context).toEqual(CONTEXT)
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
    expect(rows[0].context).toEqual(CONTEXT)
  })
})

describe("the profile marker in a stored session", () => {
  const profile = { source: "tiktok" as const, readAt: NOW.toISOString(), interests: ["Bouldern", "Kaffee"] }

  it("is saved with the turn, inside the context", async () => {
    await saveFinderSession(SESSION, { chat: [], context: CONTEXT, lastOptions: null, profile })
    expect(queries.find((q) => q.method === "update")?.args[0]).toEqual({ chat: [], context: { ...CONTEXT, profile }, last_options: null })
    expect(storedContext(CONTEXT, null)).toEqual(CONTEXT)
  })

  it("is read back for the server and never reaches the visitor-facing context", () => {
    const stored = { ...CONTEXT, interests: ["Bouldern"], profile }
    expect(parseProfile(stored)).toEqual(profile)
    expect(parseContext(stored)).toEqual({ ...CONTEXT, interests: ["Bouldern"] })
    expect(parseProfile(CONTEXT)).toBeNull()
    expect(parseProfile({ profile: { source: "facebook", readAt: "x" } })).toBeNull()
  })

  it("round-trips a LinkedIn read, so the session keeps its interests and its one read", async () => {
    const linkedin = { source: "linkedin" as const, readAt: NOW.toISOString(), interests: ["Lastenräder", "Trailrunning"] }
    await saveFinderSession(SESSION, { chat: [], context: CONTEXT, lastOptions: null, profile: linkedin })
    const saved = queries.find((q) => q.method === "update")?.args[0] as { context: unknown }
    expect(parseProfile(JSON.parse(JSON.stringify(saved.context)))).toEqual(linkedin)
    expect(parseContext(saved.context)).toEqual(CONTEXT)
    expect(parseProfile(null)).toBeNull()
  })
})
