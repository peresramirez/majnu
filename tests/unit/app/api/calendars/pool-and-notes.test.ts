import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
let user: { id: string; is_anonymous?: boolean } | null
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock("@/lib/calendars/pool", () => ({ runPool: vi.fn() }))
vi.mock("@/lib/calendars/notes", () => ({ writeNotes: vi.fn() }))
vi.mock("@/lib/agents/builder", () => ({ BuilderRefusal: class BuilderRefusal extends Error {} }))
vi.mock("@/lib/calendars/sessions", () => ({
  getMyCalendarSession: vi.fn(),
  claimNotesRun: vi.fn(),
  releaseNotesRun: vi.fn(),
  NOTES_PER_DAY: 4,
}))
let stored: CalendarContent
vi.mock("@/lib/letters/store", () => ({
  getMyLetter: vi.fn(),
  updateMyCalendar: vi.fn(async (_id: string, update: (c: CalendarContent) => CalendarContent | null) => {
    const next = update(stored)
    if (next) stored = next
    return { content: stored, slug: "Cal3nd4rAB", templateId: "advent-classic" }
  }),
}))

import { POST as notesPOST } from "@/app/api/calendars/[id]/notes/route"
import { POST as poolPOST } from "@/app/api/calendars/[id]/pool/route"
import { BuilderRefusal } from "@/lib/agents/builder"
import { initialContent, setDoor } from "@/lib/calendars/doors"
import { writeNotes } from "@/lib/calendars/notes"
import { runPool } from "@/lib/calendars/pool"
import { claimNotesRun, getMyCalendarSession, releaseNotesRun, type CalendarSession } from "@/lib/calendars/sessions"
import type { CalendarContent } from "@/lib/letters/schema"
import { getMyLetter, type OwnedLetter } from "@/lib/letters/store"

const ID = "11111111-1111-4111-8111-111111111111"
const SESSION = {
  id: "s1",
  ownerId: "user-1",
  context: { language: "de", relationship: "meine Freundin", interests: ["Yoga"] },
  marker: { letterId: ID, name: "Anna", kind: "partner", doorBudget: "unter 10 €", notesRuns: [] },
} as unknown as CalendarSession

function letter(content: CalendarContent): OwnedLetter {
  return {
    id: ID,
    ownerId: "user-1",
    slug: "Cal3nd4rAB",
    kind: "calendar",
    templateId: "advent-classic",
    title: "An advent calendar for Anna",
    content,
    createdAt: "",
    updatedAt: "",
    chat: [],
  }
}

const params = { params: Promise.resolve({ id: ID }) }
const req = (body?: unknown) =>
  new Request(`https://majnu.app/api/calendars/${ID}/x`, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  user = { id: "user-1" }
  stored = initialContent({ templateId: "advent-classic", recipientName: "Anna", senderName: "Javier", startDate: "2026-12-01", timezone: "Europe/Berlin" })
  vi.mocked(getMyLetter).mockImplementation(async () => letter(stored))
  vi.mocked(getMyCalendarSession).mockResolvedValue(SESSION)
  vi.mocked(claimNotesRun).mockResolvedValue({ ok: true, at: "2026-11-22T10:00:00.000Z" })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("POST /api/calendars/<id>/pool", () => {
  it("refuses guests", async () => {
    user = { id: "g", is_anonymous: true }
    expect((await poolPOST(req({}), params)).status).toBe(403)
    expect(runPool).not.toHaveBeenCalled()
  })

  it("runs a pool for the sender's calendar and answers the ideas", async () => {
    const pool = [{ id: "o1", title: "Tee", description: "", reason: "", url: "https://tee.example" }]
    vi.mocked(runPool).mockResolvedValue({ ok: true, pool, lastDoorId: null, added: 1 })
    const response = await poolPOST(req(), params)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ pool, lastDoorId: null, added: 1 })
    expect(vi.mocked(runPool).mock.calls[0][0]).toMatchObject({ session: SESSION, templateId: "advent-classic", similarTo: undefined })
  })

  it("passes 'more like this' and a limit through", async () => {
    vi.mocked(runPool).mockResolvedValue({ ok: false, status: 429, reason: "personalise_daily", message: "Two a day." })
    const response = await poolPOST(req({ similarTo: "o1" }), params)
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: "Two a day.", reason: "personalise_daily" })
    expect(vi.mocked(runPool).mock.calls[0][0].similarTo).toBe("o1")
  })

  it("answers 404 for someone else's letter, a letter that is no calendar, or a calendar made in the chat", async () => {
    vi.mocked(getMyLetter).mockResolvedValueOnce(null)
    expect((await poolPOST(req(), params)).status).toBe(404)
    vi.mocked(getMyLetter).mockResolvedValueOnce({ ...letter(stored), kind: "letter" })
    expect((await poolPOST(req(), params)).status).toBe(404)
    vi.mocked(getMyCalendarSession).mockResolvedValueOnce(null)
    expect((await poolPOST(req(), params)).status).toBe(404)
    expect(runPool).not.toHaveBeenCalled()
  })
})

describe("POST /api/calendars/<id>/notes", () => {
  it("writes the empty notes once and keeps the sender's own and every gift", async () => {
    stored = setDoor(stored, 1, { gift: { title: "Tee", url: "https://tee.example" }, title: "", message: "" })!
    stored = setDoor(stored, 2, { title: "Meins", message: "Selbst geschrieben." })!
    vi.mocked(writeNotes).mockImplementation(async ({ content }) => ({
      ...content,
      headline: "24 Türchen für dich",
      doors: content.doors.map((d) => ({ day: d.day, title: `T${d.day}`, message: `Notiz ${d.day}` })),
    }))
    const response = await notesPOST(req(), params)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.written).toBe(23)
    expect(body.progress).toEqual({ filled: 24, total: 24 })
    expect(body.content.doors[0]).toEqual({ day: 1, title: "T1", message: "Notiz 1", gift: { title: "Tee", url: "https://tee.example" } })
    expect(body.content.doors[1]).toEqual({ day: 2, title: "Meins", message: "Selbst geschrieben." })
    expect(body.content.headline).toBe("24 Türchen für dich")
    expect(vi.mocked(writeNotes).mock.calls[0][0]).toMatchObject({ language: "de", marker: { relationship: "meine Freundin", interests: ["Yoga"] } })
  })

  it("answers 429 when the day's notes are used up, without calling the model", async () => {
    vi.mocked(claimNotesRun).mockResolvedValue({ ok: false, reason: "limit" })
    const response = await notesPOST(req(), params)
    expect(response.status).toBe(429)
    expect((await response.json()).reason).toBe("notes_daily")
    expect(writeNotes).not.toHaveBeenCalled()
  })

  it("gives the run back when the builder fails", async () => {
    vi.mocked(writeNotes).mockRejectedValueOnce(new BuilderRefusal())
    expect((await notesPOST(req(), params)).status).toBe(422)
    vi.mocked(writeNotes).mockRejectedValueOnce(new Error("boom"))
    expect((await notesPOST(req(), params)).status).toBe(500)
    expect(releaseNotesRun).toHaveBeenCalledTimes(2)
  })

  it("does nothing when every door already has a note", async () => {
    for (let day = 1; day <= 24; day++) stored = setDoor(stored, day, { title: "", message: `Note ${day}` })!
    const body = await (await notesPOST(req(), params)).json()
    expect(body.written).toBe(0)
    expect(claimNotesRun).not.toHaveBeenCalled()
  })
})
