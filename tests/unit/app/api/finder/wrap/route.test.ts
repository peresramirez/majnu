import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
let user: { id: string } | null
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock("@/lib/finder/sessions", () => ({ getMyFinderSession: vi.fn() }))
vi.mock("@/lib/finder/wrap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/finder/wrap")>()),
  wrapOption: vi.fn(),
}))
vi.mock("@/lib/limits", () => ({ canCreateLetter: vi.fn(), canUseFeature: vi.fn() }))

import { POST } from "@/app/api/finder/wrap/route"
import { BuilderRefusal } from "@/lib/agents/builder"
import type { GiftOption } from "@/lib/finder/events"
import { getMyFinderSession, type FinderSession } from "@/lib/finder/sessions"
import { wrapOption } from "@/lib/finder/wrap"
import { canCreateLetter, canUseFeature } from "@/lib/limits"

const OPTION: GiftOption = {
  id: "o2",
  title: "Fotobuch A4",
  description: "Ein Buch voller Fotos.",
  reason: "Erinnerungen.",
  price: "29,99 €",
  url: "https://fotobuch.example/a4",
  imageUrl: "https://fotobuch.example/a4.jpg",
}

const SESSION: FinderSession = {
  id: "22222222-2222-4222-8222-222222222222",
  ownerId: "user-1",
  context: { country: "DE", language: "de", currency: "EUR", relationship: "Mama" },
  timezone: "Europe/Berlin",
  chat: [],
  lastOptions: { options: [OPTION], recommendedId: "o2", why: "Weil." },
  profile: null,
}

function post(body: unknown): Request {
  return new Request("https://majnu.app/api/finder/wrap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const valid = { sessionId: SESSION.id, optionId: "o2", templateId: "gift-reveal", recipientName: "Anna", senderName: "Javier", note: "Danke." }

beforeEach(() => {
  vi.clearAllMocks()
  user = { id: "user-1" }
  vi.mocked(getMyFinderSession).mockResolvedValue(SESSION)
  vi.mocked(canCreateLetter).mockResolvedValue({ ok: true })
  vi.mocked(canUseFeature).mockResolvedValue({ ok: true })
  vi.mocked(wrapOption).mockResolvedValue({ letterId: "letter-1", slug: "AbCdEfGh34" })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("POST /api/finder/wrap", () => {
  it("answers 401 session_required without a Supabase session", async () => {
    user = null
    const response = await POST(post(valid))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "session_required" })
  })

  it("wraps the chosen option from the stored session and answers the letter id and slug", async () => {
    const response = await POST(post(valid))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ letterId: "letter-1", slug: "AbCdEfGh34" })
    expect(wrapOption).toHaveBeenCalledWith({
      option: OPTION,
      context: SESSION.context,
      templateId: "gift-reveal",
      recipientName: "Anna",
      senderName: "Javier",
      note: "Danke.",
      now: expect.any(Date),
      timezone: "Europe/Berlin",
    })
  })

  it("accepts only the three gift templates", async () => {
    for (const templateId of ["classic-envelope", "postcard"]) {
      expect((await POST(post({ ...valid, templateId }))).status).toBe(200)
    }
    for (const templateId of ["advent-classic", "wedding-invite", "nope"]) {
      expect((await POST(post({ ...valid, templateId }))).status).toBe(400)
    }
  })

  it("answers 404 for a session that is not the visitor's or an option it never showed", async () => {
    vi.mocked(getMyFinderSession).mockResolvedValueOnce(null)
    expect((await POST(post(valid))).status).toBe(404)
    const response = await POST(post({ ...valid, optionId: "made-up" }))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "Dieses Geschenk ist nicht mehr in dieser Suche. Wähl eine der gezeigten Ideen." })
    expect(wrapOption).not.toHaveBeenCalled()
  })

  it("keeps the daily letter limit", async () => {
    vi.mocked(canCreateLetter).mockResolvedValue({ ok: false, reason: "daily_letters", message: "Five a day." })
    const response = await POST(post(valid))
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: "Five a day." })
    expect(wrapOption).not.toHaveBeenCalled()
  })

  it("keeps the free plan's monthly gifts when billing is on", async () => {
    vi.mocked(canUseFeature).mockResolvedValue({ ok: false, reason: "monthly_gifts", message: "Three a month." })
    const response = await POST(post(valid))
    expect(response.status).toBe(403)
    expect(canUseFeature).toHaveBeenCalledWith("new_gift")
  })

  it("answers 422 when the builder declines and 500 when it fails", async () => {
    vi.mocked(wrapOption).mockRejectedValueOnce(new BuilderRefusal())
    expect((await POST(post(valid))).status).toBe(422)
    vi.mocked(wrapOption).mockRejectedValueOnce(new Error("overloaded"))
    expect((await POST(post(valid))).status).toBe(500)
  })
})
