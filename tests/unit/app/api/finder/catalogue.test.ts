// POST /api/finder's instant first answer from the gift catalogue (issue #97):
// a first message streams six catalogue gifts with no model call and no
// research, saves them so they can be chosen, and the next message's model
// turn hears what the visitor saw.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-1", is_anonymous: true } } }) } }),
}))
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ cf: { country: "DE", region: "Berlin" }, env: {}, ctx: { waitUntil: () => {} } }),
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
vi.mock("@/lib/finder/catalog", () => ({ loadCatalogue: vi.fn() }))

import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta"
import { POST } from "@/app/api/finder/route"
import { runFinderTurn } from "@/lib/finder/agent"
import { loadCatalogue } from "@/lib/finder/catalog"
import type { CatalogueGift } from "@/lib/finder/catalog-match"
import type { FinderEvent } from "@/lib/finder/events"
import { canStartSession, findOpenSession } from "@/lib/finder/limits"
import { createFinderSession, getMyFinderSession, saveFinderSession, type FinderSession } from "@/lib/finder/sessions"

function post(body: unknown, files: { blob: Blob; name: string }[] = []): Request {
  if (files.length === 0) {
    return new Request("https://majnu.app/api/finder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  }
  const form = new FormData()
  form.set("request", JSON.stringify(body))
  for (const file of files) form.append("file", file.blob, file.name)
  return new Request("https://majnu.app/api/finder", { method: "POST", body: form })
}

async function eventsOf(response: Response): Promise<FinderEvent[]> {
  expect(response.status).toBe(200)
  return (await response.text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as FinderEvent)
}

const locale = { language: "de-DE", timezone: "Europe/Berlin" }

function gift(id: string, groups: string[], extra: Partial<CatalogueGift> = {}): CatalogueGift {
  return {
    id,
    groups,
    occasions: [],
    interests: [],
    title: `Geschenk ${id}`,
    description: `Über ${id}.`,
    why: `Weil ${id}.`,
    shop: "Thalia",
    price: "29,99 €",
    price_eur: 29.99,
    url: `https://shop.example/${id}`,
    image_url: null,
    ...extra,
  }
}

const rows: CatalogueGift[] = [
  ...Array.from({ length: 6 }, (_, i) => gift(`mum-${i}`, ["mother"])),
  gift("mum-bday", ["mother"], { occasions: ["birthday"] }),
  ...Array.from({ length: 6 }, (_, i) => gift(`dad-${i}`, ["father"])),
]

const fresh: FinderSession = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerId: "user-1",
  context: { country: "DE", region: "Berlin", language: "de", currency: "EUR" },
  timezone: "Europe/Berlin",
  chat: [],
  lastOptions: null,
  profiles: { day: "", paid: 0, reads: [] },
}

const userTurn: BetaMessageParam = { role: "user", content: [{ type: "text", text: "Personalise the gift" }] }
const assistantTurn: BetaMessageParam = { role: "assistant", content: [{ type: "text", text: "Gern." }] }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadCatalogue).mockResolvedValue(rows)
  vi.mocked(canStartSession).mockResolvedValue({ ok: true })
  vi.mocked(findOpenSession).mockResolvedValue(null)
  vi.mocked(createFinderSession).mockResolvedValue(fresh)
  vi.mocked(saveFinderSession).mockResolvedValue()
  vi.mocked(runFinderTurn).mockResolvedValue({ appended: [userTurn, assistantTurn], outcome: "done" })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("the first message (issue #97)", () => {
  it("streams six catalogue gifts for the group at once, with no model call and no research", async () => {
    const events = await eventsOf(await POST(post({ message: "Ein Geschenk für meine Mama zum Geburtstag", locale })))

    expect(runFinderTurn).not.toHaveBeenCalled()
    expect(events.map((e) => e.type)).toEqual(["session", "context", "text", "options", "done"])
    const options = events.find((e) => e.type === "options") as Extract<FinderEvent, { type: "options" }>
    expect(options.source).toBe("catalogue")
    expect(options.options).toHaveLength(6)
    // The birthday gift matches the occasion, so it is recommended, first.
    expect(options.recommendedId).toBe("cat-mum-bday")
    expect(options.options[0].id).toBe("cat-mum-bday")
    expect(options.options.every((o) => o.id.startsWith("cat-mum-"))).toBe(true)
    expect(events.find((e) => e.type === "context")).toEqual({
      type: "context",
      context: { country: "DE", region: "Berlin", language: "de", currency: "EUR", relationship: "Mama", occasion: "Geburtstag" },
      // Who it is for and the occasion: 20 points, and the profile would add most.
      personalisation: { score: 20, next: { key: "profile", label: "Add their Instagram, TikTok or LinkedIn", gain: 20 } },
    })
    expect(events.find((e) => e.type === "text")).toEqual({ type: "text", delta: "Hier sind sechs Ideen aus unserem Katalog, mein Favorit vorne. Soll ich etwas nur für diese Person suchen? Tippe unten auf „Personalise the gift“." })
  })

  it("saves the options as the session's last options, with the marker, and leaves the conversation as it was", async () => {
    await eventsOf(await POST(post({ message: "for my dad", locale })))
    expect(saveFinderSession).toHaveBeenCalledTimes(1)
    const [, saved] = vi.mocked(saveFinderSession).mock.calls[0]
    expect(saved.chat).toEqual([])
    expect(saved.lastOptions?.options.map((o) => o.id).every((id) => id.startsWith("cat-dad-"))).toBe(true)
    expect(saved.lastOptions?.catalogue).toEqual({ message: "for my dad", group: "father" })
  })

  it("marks a started-over session, so the next turn hears the visitor sees nothing before it", async () => {
    const old = { ...fresh, chat: [userTurn, assistantTurn] }
    vi.mocked(findOpenSession).mockResolvedValue(old)
    await eventsOf(await POST(post({ message: "for my dad", locale })))
    const [, saved] = vi.mocked(saveFinderSession).mock.calls[0]
    expect(saved.chat).toBe(old.chat)
    expect(saved.lastOptions?.catalogue).toEqual({ message: "for my dad", group: "father", startedOver: true })
    expect(runFinderTurn).not.toHaveBeenCalled()
  })

  it("asks Majnu as before when the catalogue is empty or cannot be read", async () => {
    vi.mocked(loadCatalogue).mockResolvedValue([])
    await eventsOf(await POST(post({ message: "für meine Mama", locale })))
    expect(runFinderTurn).toHaveBeenCalledTimes(1)
    expect(vi.mocked(runFinderTurn).mock.calls[0][0].state.askFirst).toBe(true)
    expect(vi.mocked(runFinderTurn).mock.calls[0][0].state.catalogueShown).toBeNull()
  })

  it("leaves a first message with files to Majnu", async () => {
    const note = { blob: new Blob(["Wishlist: Kindle"], { type: "text/plain" }), name: "wishlist.txt" }
    await POST(post({ message: "für meine Mama", locale }, [note]))
    expect(loadCatalogue).not.toHaveBeenCalled()
  })

  it("says so when the options cannot be saved, and shows none it could not wrap", async () => {
    vi.mocked(saveFinderSession).mockRejectedValue(new Error("db down"))
    const events = await eventsOf(await POST(post({ message: "für meine Mama", locale })))
    expect(events.map((e) => e.type)).toEqual(["session", "error", "done"])
  })
})

describe("the message after the instant answer", () => {
  const shown = {
    options: [{ id: "cat-mum-1", title: "Buch", description: "Ein Buch.", reason: "Liest gern.", url: "https://shop.example/b" }],
    recommendedId: "cat-mum-1",
    why: "Liest gern.",
  }
  const afterCatalogue: FinderSession = { ...fresh, lastOptions: { ...shown, catalogue: { message: "für meine Mama", group: "mother" } } }

  it("goes to Majnu with what the visitor saw, may search at once, and drops the marker when saved", async () => {
    vi.mocked(getMyFinderSession).mockResolvedValue(afterCatalogue)
    await eventsOf(await POST(post({ sessionId: fresh.id, message: "Personalise the gift", locale })))

    expect(loadCatalogue).not.toHaveBeenCalled()
    const { state } = vi.mocked(runFinderTurn).mock.calls[0][0]
    expect(state.askFirst).toBe(false)
    expect(state.catalogueShown).toContain("<catalogue_shown>")
    expect(state.catalogueShown).toContain('"für meine Mama"')
    expect(state.catalogueShown).toContain("cat-mum-1")
    expect(state.lastOptions).toEqual(shown)
    const [, saved] = vi.mocked(saveFinderSession).mock.calls[0]
    expect(saved.lastOptions).toEqual(shown)
  })

  it("passes on a started-over marker as the started-over line", async () => {
    vi.mocked(getMyFinderSession).mockResolvedValue({
      ...afterCatalogue,
      chat: [userTurn, assistantTurn],
      lastOptions: { ...shown, catalogue: { message: "für meine Mama", group: "mother", startedOver: true } },
    })
    await eventsOf(await POST(post({ sessionId: fresh.id, message: "Personalise the gift", locale })))
    expect(vi.mocked(runFinderTurn).mock.calls[0][0].state.startedOver).toBe(true)
  })

  it("counts the visitor's own answers and the profiles read into the score on every context event", async () => {
    const said: BetaMessageParam = { role: "user", content: [{ type: "text", text: "<context>x</context>" }, { type: "text", text: "Free time: other: chess." }] }
    vi.mocked(getMyFinderSession).mockResolvedValue({
      ...fresh,
      chat: [said, assistantTurn],
      lastOptions: shown,
      profiles: { day: "2026-11-22", paid: 1, reads: [{ source: "instagram", readAt: "2026-11-22T10:00:00Z", key: "k", status: "read", interests: ["Jazz"] }] },
    })
    vi.mocked(runFinderTurn).mockImplementation(async ({ state }) => {
      state.emit({ type: "context", context: { language: "de", relationship: "Mama" } })
      return { appended: [userTurn, assistantTurn], outcome: "done" }
    })
    const events = await eventsOf(await POST(post({ sessionId: fresh.id, message: "Occasion: other: her retirement.", locale })))
    const context = events.find((e) => e.type === "context") as Extract<FinderEvent, { type: "context" }>
    // Relationship 10, a profile read 20, two own answers 10.
    expect(context.personalisation?.score).toBe(40)
  })

  it("hears it only once: a later message has no catalogue block", async () => {
    vi.mocked(getMyFinderSession).mockResolvedValue({ ...fresh, chat: [userTurn, assistantTurn], lastOptions: shown })
    await eventsOf(await POST(post({ sessionId: fresh.id, message: "Free time: other: restores old motorbikes.", locale })))
    const { state } = vi.mocked(runFinderTurn).mock.calls[0][0]
    expect(state.catalogueShown).toBeNull()
    expect(state.askFirst).toBe(false)
  })
})
