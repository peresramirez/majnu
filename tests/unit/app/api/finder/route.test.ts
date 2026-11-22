import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
let user: { id: string; is_anonymous?: boolean } | null
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ cf: { country: "DE", region: "Berlin", city: "Berlin", latitude: "52.51234" }, env: {}, ctx: { waitUntil: () => {} } }),
}))
vi.mock("@/lib/finder/sessions", () => ({
  createFinderSession: vi.fn(),
  getMyFinderSession: vi.fn(),
  saveFinderSession: vi.fn(),
}))
vi.mock("@/lib/finder/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/finder/limits")>()),
  canStartSession: vi.fn(),
  findOpenSession: vi.fn(),
}))
vi.mock("@/lib/finder/agent", () => ({ runFinderTurn: vi.fn() }))

import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta"
import { POST } from "@/app/api/finder/route"
import { runFinderTurn } from "@/lib/finder/agent"
import type { FinderEvent } from "@/lib/finder/events"
import { canStartSession, findOpenSession, FINDER_LIMITS } from "@/lib/finder/limits"
import { createFinderSession, getMyFinderSession, saveFinderSession, type FinderSession } from "@/lib/finder/sessions"

function post(body: unknown): Request {
  return new Request("https://majnu.app/api/finder", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

async function eventsOf(response: Response): Promise<FinderEvent[]> {
  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("application/x-ndjson")
  return (await response.text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as FinderEvent)
}

const locale = { language: "de-DE", languages: ["de-DE", "en"], timezone: "Europe/Berlin" }
const userTurn: BetaMessageParam = { role: "user", content: [{ type: "text", text: "Mama" }] }
const assistantTurn: BetaMessageParam = { role: "assistant", content: [{ type: "text", text: "Gern." }] }

const fresh: FinderSession = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerId: "user-1",
  context: { country: "DE", region: "Berlin", language: "de", currency: "EUR" },
  timezone: "Europe/Berlin",
  chat: [],
  lastOptions: null,
  profile: null,
}

const existing: FinderSession = {
  ...fresh,
  id: "22222222-2222-4222-8222-222222222222",
  context: { ...fresh.context, relationship: "Mama", ageRange: [45, 70] },
  chat: [userTurn, assistantTurn],
  lastOptions: { options: [], recommendedId: "x", why: "" },
}

beforeEach(() => {
  vi.clearAllMocks()
  user = { id: "user-1", is_anonymous: true }
  vi.mocked(canStartSession).mockResolvedValue({ ok: true })
  vi.mocked(findOpenSession).mockResolvedValue(null)
  vi.mocked(createFinderSession).mockResolvedValue(fresh)
  vi.mocked(getMyFinderSession).mockResolvedValue(existing)
  vi.mocked(saveFinderSession).mockResolvedValue()
  vi.mocked(runFinderTurn).mockImplementation(async ({ state }) => {
    state.emit({ type: "context", context: { ...state.base, relationship: "Mama", ageRange: [45, 70] } })
    state.emit({ type: "options", options: [], recommendedId: "o1", why: "Weil." })
    state.context = { ...state.base, relationship: "Mama" }
    return { appended: [userTurn, assistantTurn], outcome: "done" }
  })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("continuing today's open session (issue #70)", () => {
  it("continues it for a message without a session id, so a reload uses up no session", async () => {
    vi.mocked(findOpenSession).mockResolvedValue(existing)
    const events = await eventsOf(await POST(post({ message: "Finde ein Geschenk für meinen Vater", locale })))

    expect(events[0]).toEqual({ type: "session", sessionId: existing.id })
    expect(findOpenSession).toHaveBeenCalledWith("user-1", expect.any(Date))
    expect(createFinderSession).not.toHaveBeenCalled()
    expect(canStartSession).not.toHaveBeenCalled()
    const { state, history } = vi.mocked(runFinderTurn).mock.calls[0][0]
    expect(history).toBe(existing.chat)
    // The visitor sees none of the earlier conversation: Majnu is told so.
    expect(state.startedOver).toBe(true)
    expect(saveFinderSession).toHaveBeenCalledWith(existing, expect.objectContaining({ chat: [...existing.chat, userTurn, assistantTurn] }))
  })

  it("does not call an empty session a new start", async () => {
    vi.mocked(findOpenSession).mockResolvedValue(fresh)
    await eventsOf(await POST(post({ message: "Mama", locale })))
    expect(vi.mocked(runFinderTurn).mock.calls[0][0].state.startedOver).toBe(false)
  })

  it("starts a new session only when none is open, and never for a message that has an id", async () => {
    await eventsOf(await POST(post({ message: "Mama", locale })))
    expect(createFinderSession).toHaveBeenCalledTimes(1)
    vi.mocked(createFinderSession).mockClear()
    vi.mocked(findOpenSession).mockClear()
    await eventsOf(await POST(post({ sessionId: existing.id, message: "Sie ist 60", locale })))
    expect(findOpenSession).not.toHaveBeenCalled()
    expect(createFinderSession).not.toHaveBeenCalled()
  })
})

describe("a message from the wrap step (issue #70)", () => {
  const shown = {
    options: [
      { id: "opt-1", title: "Fotobuch A4", description: "40 Seiten.", reason: "Erinnerungen.", url: "https://fotobuch.example/a4" },
      { id: "opt-2", title: "Kräutergarten", description: "Sechs Kräuter.", reason: "Garten.", url: "https://garten.example/k" },
    ],
    recommendedId: "opt-1",
    why: "Weil.",
  }

  beforeEach(() => {
    vi.mocked(getMyFinderSession).mockResolvedValue({ ...existing, lastOptions: shown })
  })

  it("gives the agent the chosen option from the session's own last options, and the design", async () => {
    await eventsOf(await POST(post({ sessionId: existing.id, message: "für meine Schwester Ana", locale, wrap: { optionId: "opt-2", templateId: "postcard" } })))
    const { state } = vi.mocked(runFinderTurn).mock.calls[0][0]
    expect(state.wrap).toEqual({ option: shown.options[1], templateId: "postcard" })
  })

  it("sends no choice without one", async () => {
    await eventsOf(await POST(post({ sessionId: existing.id, message: "Hallo", locale })))
    expect(vi.mocked(runFinderTurn).mock.calls[0][0].state.wrap).toBeNull()
  })

  it("refuses an option that is not among the session's last options, without calling the model", async () => {
    const response = await POST(post({ sessionId: existing.id, message: "für Ana", locale, wrap: { optionId: "opt-9", templateId: "postcard" } }))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "Dieses Geschenk ist nicht mehr in dieser Suche. Wähl eine der gezeigten Ideen." })
    expect(runFinderTurn).not.toHaveBeenCalled()
  })

  it("refuses a choice without a session, or with a design the finder does not offer", async () => {
    expect((await POST(post({ message: "für Ana", locale, wrap: { optionId: "opt-1", templateId: "postcard" } }))).status).toBe(404)
    expect((await POST(post({ sessionId: existing.id, message: "für Ana", locale, wrap: { optionId: "opt-1", templateId: "wedding-invite" } }))).status).toBe(400)
    expect(runFinderTurn).not.toHaveBeenCalled()
    expect(createFinderSession).not.toHaveBeenCalled()
  })
})

describe("POST /api/finder", () => {
  it("answers 401 session_required without a Supabase session", async () => {
    user = null
    const response = await POST(post({ message: "Mama", locale }))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "session_required" })
    expect(runFinderTurn).not.toHaveBeenCalled()
  })

  it("needs a message, and not a long one, and answers in the visitor's language", async () => {
    expect((await POST(post("not json"))).status).toBe(400)
    const empty = await POST(post({ message: "  ", locale }))
    expect(empty.status).toBe(400)
    expect(await empty.json()).toEqual({ error: "Schreib zuerst, für wen das Geschenk ist." })
    const long = await POST(post({ message: "x".repeat(2001), locale: { language: "en-GB" } }))
    expect(long.status).toBe(413)
    expect(await long.json()).toEqual({ error: "That message is too long. Try a shorter one." })
  })

  it("creates a session for a first message and sends its id first, ending with done", async () => {
    const events = await eventsOf(await POST(post({ message: "Finde ein Geschenk für meine Mutter", locale })))

    expect(events[0]).toEqual({ type: "session", sessionId: fresh.id })
    expect(events.map((e) => e.type)).toEqual(["session", "context", "options", "done"])
    expect(canStartSession).toHaveBeenCalledWith("user-1", expect.any(Date), "de")
    expect(createFinderSession).toHaveBeenCalledWith("user-1", { country: "DE", region: "Berlin", language: "de", currency: "EUR" }, "Europe/Berlin")
  })

  it("gives the agent the country and region, the browser language and timezone, and nothing more precise", async () => {
    await eventsOf(await POST(post({ message: "Mama", locale })))
    const { state, history, message } = vi.mocked(runFinderTurn).mock.calls[0][0]
    expect(history).toEqual([])
    expect(message).toBe("Mama")
    expect(state.base).toEqual({ country: "DE", region: "Berlin", language: "de", currency: "EUR" })
    expect(state.browserLanguage).toBe("de-DE")
    expect(state.timezone).toBe("Europe/Berlin")
    // A distinctive latitude, so a timestamp's seconds ("…:52.5…") can never match by chance.
    expect(JSON.stringify(state)).not.toMatch(/52\.51234|latitude|"city"/)
  })

  it("saves the turn append-only with the context and options it ended with", async () => {
    await eventsOf(await POST(post({ sessionId: existing.id, message: "Sie ist 60", locale })))

    expect(createFinderSession).not.toHaveBeenCalled()
    const { state, history } = vi.mocked(runFinderTurn).mock.calls[0][0]
    expect(history).toBe(existing.chat)
    expect(state.context).toEqual({ ...fresh.context, relationship: "Mama" })
    expect(state.lastOptions).toBe(existing.lastOptions)
    expect(saveFinderSession).toHaveBeenCalledWith(existing, {
      chat: [...existing.chat, userTurn, assistantTurn],
      context: { ...fresh.context, relationship: "Mama" },
      lastOptions: existing.lastOptions,
      profile: null,
    })
  })

  it("carries the session's profile read into the turn and saves the one the turn ended with", async () => {
    const before = { source: "instagram" as const, readAt: "2026-11-21T10:00:00.000Z", interests: [] }
    vi.mocked(getMyFinderSession).mockResolvedValue({ ...existing, profile: before })
    vi.mocked(runFinderTurn).mockImplementation(async ({ state }) => {
      expect(state.profile).toEqual(before)
      state.profile = { ...before, interests: ["Bouldern", "Kaffee", "Fotografie"] }
      return { appended: [userTurn, assistantTurn], outcome: "done" }
    })
    const events = await eventsOf(await POST(post({ sessionId: existing.id, message: "instagram.com/natgeo", locale })))
    expect(events.at(-1)).toEqual({ type: "done" })
    expect(saveFinderSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: existing.id }),
      expect.objectContaining({ profile: { ...before, interests: ["Bouldern", "Kaffee", "Fotografie"] } }),
    )
    // The marker is the server's: no event carries it to the browser.
    expect(JSON.stringify(events)).not.toContain("readAt")
  })

  it("sends no session event for an existing session, and 404 for someone else's", async () => {
    const events = await eventsOf(await POST(post({ sessionId: existing.id, message: "Hi", locale })))
    expect(events.some((e) => e.type === "session")).toBe(false)

    vi.mocked(getMyFinderSession).mockResolvedValue(null)
    const response = await POST(post({ sessionId: "33333333-3333-4333-8333-333333333333", message: "Hi", locale }))
    expect(response.status).toBe(404)
  })

  it("refuses a new session at the daily limit without creating it or calling the model", async () => {
    vi.mocked(canStartSession).mockResolvedValue({ ok: false, reason: "finder_daily", message: "Drei am Tag." })
    const events = await eventsOf(await POST(post({ message: "Mama", locale })))
    expect(events).toEqual([{ type: "limit", reason: "finder_daily", message: "Drei am Tag." }, { type: "done" }])
    expect(createFinderSession).not.toHaveBeenCalled()
    expect(runFinderTurn).not.toHaveBeenCalled()
  })

  it(`refuses a message after ${FINDER_LIMITS.messagesPerSession} in one session`, async () => {
    const turn: BetaMessageParam = { role: "user", content: [{ type: "text", text: "<context/>" }, { type: "text", text: "Hi" }] }
    vi.mocked(getMyFinderSession).mockResolvedValue({ ...existing, chat: Array.from({ length: FINDER_LIMITS.messagesPerSession }, () => turn) })
    const events = await eventsOf(await POST(post({ sessionId: existing.id, message: "Hi", locale })))
    expect(events).toEqual([{ type: "limit", reason: "session_full", message: expect.any(String) }, { type: "done" }])
    expect(runFinderTurn).not.toHaveBeenCalled()
  })

  it("saves nothing when the model never replied, so the visitor can simply resend", async () => {
    vi.mocked(runFinderTurn).mockResolvedValue({ appended: [userTurn], outcome: "refusal" })
    const events = await eventsOf(await POST(post({ message: "Mama", locale })))
    expect(events.at(-1)).toEqual({ type: "done" })
    expect(saveFinderSession).not.toHaveBeenCalled()
  })

  it("tells the visitor when the turn could not be saved, and still ends with done", async () => {
    vi.mocked(saveFinderSession).mockRejectedValue(new Error("db down"))
    const events = await eventsOf(await POST(post({ message: "Mama", locale })))
    expect(events.slice(-2)).toEqual([
      { type: "error", message: "Beim Speichern dieser Suche ist etwas schiefgegangen. Versuch es noch einmal." },
      { type: "done" },
    ])
  })

  it("answers 500 when the session cannot be created", async () => {
    vi.mocked(createFinderSession).mockRejectedValue(new Error("db down"))
    const response = await POST(post({ message: "Mama", locale }))
    expect(response.status).toBe(500)
  })

  it("works without a locale, in English", async () => {
    await eventsOf(await POST(post({ message: "A gift for my dad" })))
    const { state } = vi.mocked(runFinderTurn).mock.calls[0][0]
    expect(state.base.language).toBe("en")
    expect(state.timezone).toBe("Europe/Berlin")
  })
})
