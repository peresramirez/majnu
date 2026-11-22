import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
let user: { id: string; is_anonymous?: boolean } | null
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock("@/lib/calendars/sessions", () => ({ getMyCalendarSession: vi.fn() }))

// A stand-in for the store's optimistic update: applies `update` to a stored copy.
let stored: CalendarContent
vi.mock("@/lib/letters/store", () => ({
  updateMyCalendar: vi.fn(async (_id: string, update: (c: CalendarContent) => CalendarContent | null) => {
    const next = update(stored)
    if (next) stored = next
    return { content: stored, slug: "Cal3nd4rAB", templateId: "advent-classic" }
  }),
}))

import { PUT } from "@/app/api/calendars/[id]/doors/[day]/route"
import { initialContent } from "@/lib/calendars/doors"
import { getMyCalendarSession, type CalendarSession } from "@/lib/calendars/sessions"
import type { CalendarContent } from "@/lib/letters/schema"
import { updateMyCalendar } from "@/lib/letters/store"

const ID = "11111111-1111-4111-8111-111111111111"
const OPTION = {
  id: "o1",
  title: "Lavendel-Badesalz",
  description: "Ein Badesalz.",
  reason: "Bäder.",
  price: "8,90 €",
  url: "https://seife.example/bad",
  imageUrl: "https://seife.example/bad.jpg",
  shop: "Seife",
}

function put(day: string, body: unknown) {
  const request = new Request(`https://majnu.app/api/calendars/${ID}/doors/${day}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  return PUT(request, { params: Promise.resolve({ id: ID, day }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  user = { id: "user-1" }
  stored = initialContent({ templateId: "advent-classic", recipientName: "Anna", senderName: "Javier", startDate: "2026-12-01", timezone: "Europe/Berlin" })
  vi.mocked(getMyCalendarSession).mockResolvedValue({ pool: { options: [OPTION], recommendedId: "", why: "" } } as unknown as CalendarSession)
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("PUT /api/calendars/<id>/doors/<day>", () => {
  it("refuses guests and visitors without a session", async () => {
    user = { id: "g", is_anonymous: true }
    expect((await put("1", { gift: null, title: "", message: "x" })).status).toBe(403)
    user = null
    expect((await put("1", { gift: null, title: "", message: "x" })).status).toBe(401)
    expect(updateMyCalendar).not.toHaveBeenCalled()
  })

  it("copies the picked idea from the stored pool onto the door, without its image", async () => {
    const response = await put("7", { gift: { type: "idea", optionId: "o1" }, title: "Für kalte Abende", message: "Ein warmes Bad." })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.door).toEqual({
      day: 7,
      title: "Für kalte Abende",
      message: "Ein warmes Bad.",
      gift: { title: "Lavendel-Badesalz", description: "Ein Badesalz.", url: "https://seife.example/bad", price: "8,90 €" },
    })
    expect(body.progress).toEqual({ filled: 1, total: 24 })
    expect(JSON.stringify(stored)).not.toContain("bad.jpg")
  })

  it("answers 404 for an idea that is not in the stored pool", async () => {
    const response = await put("7", { gift: { type: "idea", optionId: "made-up" }, title: "", message: "" })
    expect(response.status).toBe(404)
    expect(updateMyCalendar).not.toHaveBeenCalled()
  })

  it("saves the sender's own gift with a code, and refuses one without https", async () => {
    const ok = await put("3", { gift: { type: "own", title: "Kino", code: "K-4711", url: "https://kino.example" }, title: "", message: "" })
    expect((await ok.json()).door.gift).toEqual({ title: "Kino", code: "K-4711", url: "https://kino.example" })
    const bad = await put("3", { gift: { type: "own", title: "Kino", url: "javascript:alert(1)" }, title: "", message: "" })
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toBe("Links must start with https://.")
  })

  it("keeps the gift when only the note changes, and empties a door", async () => {
    await put("2", { gift: { type: "own", title: "Tee" }, title: "", message: "" })
    const kept = await (await put("2", { gift: { type: "keep" }, title: "Neu", message: "Jetzt mit Notiz." })).json()
    expect(kept.door).toEqual({ day: 2, title: "Neu", message: "Jetzt mit Notiz.", gift: { title: "Tee" } })
    const emptied = await (await put("2", { gift: null, title: "", message: "" })).json()
    expect(emptied.door).toEqual({ day: 2, title: "", message: "" })
    expect(emptied.progress.filled).toBe(0)
  })

  it("answers 404 for a door the calendar does not have, and 400 for a bad body", async () => {
    expect((await put("25", { gift: null, title: "", message: "x" })).status).toBe(404)
    expect((await put("abc", { gift: null, title: "", message: "x" })).status).toBe(404)
    expect((await put("1", { gift: { type: "nope" }, title: "", message: "" })).status).toBe(400)
  })

  it("answers 404 when the letter is not the sender's calendar", async () => {
    vi.mocked(updateMyCalendar).mockRejectedValueOnce(new Error("Letter not found"))
    expect((await put("1", { gift: null, title: "", message: "x" })).status).toBe(404)
  })
})
