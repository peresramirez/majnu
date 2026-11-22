import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/finder/pool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/finder/pool")>()),
  researchPool: vi.fn(),
}))
vi.mock("@/lib/finder/pool-limits", () => ({ claimPool: vi.fn(), claimMoreLikeThis: vi.fn(), releaseSearch: vi.fn() }))
vi.mock("@/lib/finder/limits", () => ({ claimProfileRead: vi.fn() }))
vi.mock("@/lib/social/read", () => ({ canReadSource: () => true, readProfileInterests: vi.fn() }))
vi.mock("@/lib/calendars/sessions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/calendars/sessions")>()),
  saveCalendarPool: vi.fn(),
}))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { initialContent } from "@/lib/calendars/doors"
import { poolInput, runPool } from "@/lib/calendars/pool"
import { saveCalendarPool, type CalendarSession } from "@/lib/calendars/sessions"
import type { GiftOption } from "@/lib/finder/events"
import { claimProfileRead } from "@/lib/finder/limits"
import { researchPool, ResearchRefusal } from "@/lib/finder/pool"
import { claimMoreLikeThis, claimPool, releaseSearch } from "@/lib/finder/pool-limits"
import { readProfileInterests } from "@/lib/social/read"

const NOW = new Date("2026-11-22T10:00:00Z")
const CONTENT = initialContent({ templateId: "advent-classic", recipientName: "Anna", senderName: "Javier", startDate: "2026-12-01", timezone: "Europe/Berlin" })

const EXISTING: GiftOption = { id: "o1", title: "Badesalz", description: "Lavendel.", reason: "Bäder.", url: "https://seife.example/bad", price: "8,90 €" }

function session(overrides: Partial<CalendarSession> = {}): CalendarSession {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownerId: "user-1",
    context: { country: "DE", region: "Berlin", language: "de", currency: "EUR", relationship: "meine Freundin", ageRange: [20, 35], budget: "unter 10 €", interests: ["Yoga"] },
    marker: { letterId: "letter-1", name: "Anna", kind: "partner", doorBudget: "unter 10 €", lastDoorBudget: "bis 50 €", notesRuns: [] },
    timezone: "Europe/Berlin",
    pool: { options: [EXISTING], recommendedId: "o1", why: "Für den 24." },
    profile: null,
    updatedAt: "2026-11-22T09:00:00Z",
    ...overrides,
  }
}

const REPORT = {
  ideas: [
    { title: "Yoga-Socken", reason: "Yoga.", url: "https://yoga.example/socken" },
    { title: "Badesalz", reason: "Schon da.", url: "https://seife.example/bad" },
    { title: "Teeset", reason: "Tee.", url: "https://tee.example/set" },
  ],
  lastDoor: 2,
  why: "Das Teeset passt zum 24.",
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.mocked(claimPool).mockResolvedValue({ ok: true, claimId: 7 })
  vi.mocked(claimMoreLikeThis).mockResolvedValue({ ok: true, claimId: 8 })
  vi.mocked(researchPool).mockResolvedValue(REPORT)
})

describe("poolInput", () => {
  it("briefs the researcher with the finder's context, in the sender's language and country", () => {
    const input = poolInput({ session: session(), context: session().context, content: CONTENT, templateId: "advent-classic", mode: "pool", now: NOW })
    expect(input).toMatchObject({
      mode: "pool",
      doorBudget: "unter 10 €",
      lastDoorBudget: "bis 50 €",
      country: "Berlin, Germany",
      countryCode: "DE",
      currency: "EUR",
      language: "de",
      ideas: 28,
      timezone: "Europe/Berlin",
    })
    expect(input.recipient).toContain("meine Freundin (the visitor's partner), named Anna")
    expect(input.recipient).toContain("probably about 20 to 35 years old (assumed)")
    expect(input.recipient).toContain("loves Yoga")
    expect(input.calendar).toContain("24 doors")
  })
})

describe("runPool", () => {
  it("claims a pool, researches once and replaces the pool with the linked new ideas", async () => {
    const outcome = await runPool({ session: session(), content: CONTENT, templateId: "advent-classic", now: NOW })
    expect(claimPool).toHaveBeenCalledWith({ ownerId: "user-1", sessionId: session().id, now: NOW, language: "en" })
    expect(researchPool).toHaveBeenCalledTimes(1)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.pool.map((o) => o.title)).toEqual(["Yoga-Socken", "Badesalz", "Teeset"])
    expect(outcome.lastDoorId).toBe(outcome.pool[2].id)
    expect(saveCalendarPool).toHaveBeenCalledWith(
      expect.objectContaining({ id: session().id }),
      expect.objectContaining({ pool: { options: outcome.pool, recommendedId: outcome.pool[2].id, why: "Das Teeset passt zum 24." } }),
    )
    expect(releaseSearch).not.toHaveBeenCalled()
  })

  it("adds 'more like this' ideas to the pool without repeats, as a personalised search", async () => {
    const outcome = await runPool({ session: session(), content: CONTENT, templateId: "advent-classic", similarTo: "o1", now: NOW })
    expect(claimMoreLikeThis).toHaveBeenCalled()
    expect(claimPool).not.toHaveBeenCalled()
    expect(vi.mocked(researchPool).mock.calls[0][0]).toMatchObject({ mode: "similar", ideas: 6, similarTo: EXISTING, avoid: ["Badesalz"] })
    if (!outcome.ok) throw new Error("expected ideas")
    expect(outcome.pool.map((o) => o.title)).toEqual(["Badesalz", "Yoga-Socken", "Teeset"])
    expect(outcome.added).toBe(2)
    expect(outcome.lastDoorId).toBe("o1")
  })

  it("answers 404 for an idea that is not in the pool, before claiming anything", async () => {
    const outcome = await runPool({ session: session(), content: CONTENT, templateId: "advent-classic", similarTo: "nope", now: NOW })
    expect(outcome).toMatchObject({ ok: false, status: 404 })
    expect(claimMoreLikeThis).not.toHaveBeenCalled()
  })

  it("passes a limit on as 429 with its sentence", async () => {
    vi.mocked(claimPool).mockResolvedValue({ ok: false, reason: "finder_daily", message: "Two a day." })
    const outcome = await runPool({ session: session(), content: CONTENT, templateId: "advent-classic", now: NOW })
    expect(outcome).toEqual({ ok: false, status: 429, reason: "finder_daily", message: "Two a day." })
    expect(researchPool).not.toHaveBeenCalled()
  })

  it("gives the search back when research fails or finds nothing with a link", async () => {
    vi.mocked(researchPool).mockRejectedValueOnce(new ResearchRefusal())
    expect(await runPool({ session: session(), content: CONTENT, templateId: "advent-classic", now: NOW })).toMatchObject({ ok: false, status: 422 })
    vi.mocked(researchPool).mockRejectedValueOnce(new Error("boom"))
    expect(await runPool({ session: session(), content: CONTENT, templateId: "advent-classic", now: NOW })).toMatchObject({ ok: false, status: 502 })
    vi.mocked(researchPool).mockResolvedValueOnce({ ideas: [{ title: "Ohne", reason: "x" }], lastDoor: null, why: "" })
    expect(await runPool({ session: session(), content: CONTENT, templateId: "advent-classic", now: NOW })).toMatchObject({ ok: false, status: 502 })
    expect(releaseSearch).toHaveBeenCalledTimes(3)
    expect(saveCalendarPool).not.toHaveBeenCalled()
  })

  it("reads a shared public profile once and adds its interests to the search", async () => {
    vi.mocked(claimProfileRead).mockResolvedValue({ ok: true, profile: { source: "web", readAt: NOW.toISOString(), interests: [] } })
    vi.mocked(readProfileInterests).mockResolvedValue({ ok: true, interests: ["Keramik"] })
    const withLink = session({ marker: { ...session().marker, profileLink: "https://example.com/about-anna" } })
    const outcome = await runPool({ session: withLink, content: CONTENT, templateId: "advent-classic", now: NOW })
    expect(outcome.ok).toBe(true)
    // The marker goes into the context the read rewrites, so the calendar keeps it.
    expect(vi.mocked(claimProfileRead).mock.calls[0][0].context).toMatchObject({ calendar: { letterId: "letter-1" } })
    expect(vi.mocked(researchPool).mock.calls[0][0].recipient).toContain("loves Yoga, Keramik")
    expect(vi.mocked(saveCalendarPool).mock.calls[0][1].profile).toMatchObject({ source: "web", interests: ["Keramik"] })
  })
})
