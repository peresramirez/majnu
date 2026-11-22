import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
let user: { id: string; is_anonymous?: boolean } | null
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock("@/lib/letters/store", () => ({ createLetter: vi.fn(), saveLetterContent: vi.fn() }))
vi.mock("@/lib/calendars/sessions", () => ({ createCalendarSession: vi.fn() }))
vi.mock("@/lib/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/limits")>()),
  canCreateLetter: vi.fn(),
}))
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    throw new Error("not on Workers")
  },
}))

import { POST } from "@/app/api/calendars/route"
import { createCalendarSession } from "@/lib/calendars/sessions"
import type { CalendarSetupRequest } from "@/lib/calendars/types"
import { CalendarContent } from "@/lib/letters/schema"
import { createLetter, saveLetterContent } from "@/lib/letters/store"
import { canCreateLetter } from "@/lib/limits"

const SETUP: CalendarSetupRequest = {
  templateId: "advent-classic",
  recipientName: "Anna",
  senderName: "Javier",
  relationship: "meine Freundin",
  kind: "partner",
  interests: ["Yoga", " Tee "],
  about: "Sie friert immer.",
  doorBudget: "unter 10 €",
  lastDoorBudget: "bis 50 €",
  startDate: "2026-12-01",
  timezone: "Europe/Berlin",
  locale: { language: "de-DE", timezone: "Europe/Berlin" },
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://majnu.app/api/calendars", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  user = { id: "user-1", is_anonymous: false }
  vi.mocked(canCreateLetter).mockResolvedValue({ ok: true })
  vi.mocked(createLetter).mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", slug: "Cal3nd4rAB" })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("POST /api/calendars", () => {
  it("answers 401 without a session and 403 for a guest, before reading the body", async () => {
    user = null
    expect((await POST(post(SETUP))).status).toBe(401)
    user = { id: "guest", is_anonymous: true }
    const response = await POST(post(SETUP))
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ reason: "signin_required" })
    expect(createLetter).not.toHaveBeenCalled()
  })

  it("answers 400 for a bad body, a missing name or a countdown without days", async () => {
    expect((await POST(post("{not json"))).status).toBe(400)
    expect((await POST(post({ ...SETUP, recipientName: "  " }))).status).toBe(400)
    expect((await POST(post({ ...SETUP, startDate: "2026-02-30" }))).status).toBe(400)
    expect((await POST(post({ ...SETUP, templateId: "countdown" }))).status).toBe(400)
    expect(createLetter).not.toHaveBeenCalled()
  })

  it("answers 429 at the daily letter limit", async () => {
    vi.mocked(canCreateLetter).mockResolvedValue({ ok: false, reason: "daily_letters", message: "Five a day." })
    const response = await POST(post(SETUP))
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: "Five a day.", reason: "daily_letters" })
  })

  it("saves 24 empty doors and the finder session for the pool", async () => {
    const response = await POST(post(SETUP, { "cf-ipcountry": "DE" }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ letterId: "11111111-1111-4111-8111-111111111111", slug: "Cal3nd4rAB" })

    const saved = vi.mocked(saveLetterContent).mock.calls[0]
    expect(saved[0]).toBe("11111111-1111-4111-8111-111111111111")
    expect(saved[1]).toMatchObject({ kind: "calendar", templateId: "advent-classic", title: "An advent calendar for Anna" })
    const content = CalendarContent.parse(saved[1].content)
    expect(content.doors).toHaveLength(24)
    expect(content.doors.every((d) => !d.gift && d.message === "")).toBe(true)
    expect(content).toMatchObject({ recipientName: "Anna", senderName: "Javier", startDate: "2026-12-01", timezone: "Europe/Berlin" })

    expect(createCalendarSession).toHaveBeenCalledWith({
      ownerId: "user-1",
      timezone: "Europe/Berlin",
      context: {
        country: "DE",
        language: "de",
        currency: "EUR",
        relationship: "meine Freundin",
        ageRange: [20, 35],
        budget: "unter 10 €",
        interests: ["Yoga", "Tee"],
      },
      marker: {
        letterId: "11111111-1111-4111-8111-111111111111",
        name: "Anna",
        kind: "partner",
        about: "Sie friert immer.",
        doorBudget: "unter 10 €",
        lastDoorBudget: "bis 50 €",
        notesRuns: [],
      },
    })
  })

  it("keeps an age the sender gave, and makes a countdown of the chosen length", async () => {
    await POST(post({ ...SETUP, templateId: "countdown", days: 5, ageMin: 31, ageMax: 31, startDate: "2026-12-20" }))
    expect(CalendarContent.parse(vi.mocked(saveLetterContent).mock.calls[0][1].content).doors).toHaveLength(5)
    const session = vi.mocked(createCalendarSession).mock.calls[0][0]
    expect(session.context.ageRange).toEqual([31, 31])
    expect(session.marker.age).toBe(31)
  })
})
