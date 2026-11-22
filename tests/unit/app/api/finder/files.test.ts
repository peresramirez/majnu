// POST /api/finder with photos and documents (issue #77): multipart bodies,
// what is refused before any session or model call, and what Majnu gets.
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
vi.mock("@/lib/finder/attachments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/finder/attachments")>()),
  readMessageFiles: vi.fn(),
}))

import { POST } from "@/app/api/finder/route"
import { runFinderTurn } from "@/lib/finder/agent"
import { readMessageFiles } from "@/lib/finder/attachments"
import type { FinderEvent } from "@/lib/finder/events"
import { canStartSession, findOpenSession } from "@/lib/finder/limits"
import { createFinderSession, getMyFinderSession, saveFinderSession, type FinderSession } from "@/lib/finder/sessions"

const locale = { language: "de-DE", timezone: "Europe/Berlin" }
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
const pdfWithPages = (pages: number) =>
  new TextEncoder().encode(`%PDF-1.4\n${Array.from({ length: pages }, (_, i) => `${i + 1} 0 obj << /Type /Page >> endobj\n`).join("")}%%EOF`)

const session: FinderSession = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerId: "user-1",
  context: { country: "DE", region: "Berlin", language: "de", currency: "EUR", notes: ["Spielt Saxofon"] },
  timezone: "Europe/Berlin",
  chat: [],
  lastOptions: null,
  profile: null,
}

function upload(request: Record<string, unknown>, files: { bytes: Uint8Array; name: string; type?: string }[]): Request {
  const form = new FormData()
  form.append("request", JSON.stringify({ locale, ...request }))
  for (const file of files) form.append("file", new Blob([file.bytes as BlobPart], { type: file.type ?? "application/octet-stream" }), file.name)
  return new Request("https://majnu.app/api/finder", { method: "POST", body: form })
}

async function eventsOf(response: Response): Promise<FinderEvent[]> {
  expect(response.status).toBe(200)
  return (await response.text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as FinderEvent)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(canStartSession).mockResolvedValue({ ok: true })
  vi.mocked(findOpenSession).mockResolvedValue(null)
  vi.mocked(createFinderSession).mockResolvedValue(session)
  vi.mocked(getMyFinderSession).mockResolvedValue(session)
  vi.mocked(saveFinderSession).mockResolvedValue()
  vi.mocked(readMessageFiles).mockResolvedValue({ outcomes: [{ kind: "image", status: "read", notes: ["Liebt Jazz"] }], notes: ["Liebt Jazz"] })
  vi.mocked(runFinderTurn).mockResolvedValue({
    appended: [
      { role: "user", content: [{ type: "text", text: "x" }] },
      { role: "assistant", content: [{ type: "text", text: "Schön." }] },
    ],
    outcome: "done",
  })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("refused before anything else, with the visitor's language", () => {
  it("refuses a file that is not a photo, PDF or text with 415, whatever its name and type say", async () => {
    const res = await POST(upload({ message: "Für Mama" }, [{ bytes: new Uint8Array([0x50, 0x4b, 3, 4]), name: "foto.jpg", type: "image/jpeg" }]))
    expect(res.status).toBe(415)
    expect((await res.json()).error).toContain("foto.jpg ist kein Foto")
    expect(createFinderSession).not.toHaveBeenCalled()
    expect(readMessageFiles).not.toHaveBeenCalled()
  })

  it("refuses more than 3 files, a PDF over 20 pages, and an image over 5 MB", async () => {
    const four = Array.from({ length: 4 }, (_, i) => ({ bytes: JPEG, name: `${i}.jpg` }))
    expect((await POST(upload({ message: "x" }, four))).status).toBe(400)
    const long = await POST(upload({ message: "x" }, [{ bytes: pdfWithPages(21), name: "Programm.pdf" }]))
    expect(long.status).toBe(400)
    expect((await long.json()).error).toContain("mehr als 20 Seiten")
    const big = new Uint8Array(5 * 1024 * 1024 + 1)
    big.set(JPEG)
    expect((await POST(upload({ message: "x" }, [{ bytes: big, name: "big.jpg" }]))).status).toBe(413)
    expect(runFinderTurn).not.toHaveBeenCalled()
  })

  it("refuses a request with neither words nor files, and a multipart body without its request part", async () => {
    expect((await POST(upload({ message: "  " }, []))).status).toBe(400)
    const form = new FormData()
    form.append("file", new Blob([JPEG as BlobPart]), "a.jpg")
    expect((await POST(new Request("https://majnu.app/api/finder", { method: "POST", body: form }))).status).toBe(400)
  })
})

describe("reading the files, then Majnu", () => {
  it("reads them before the turn, shows the notes as chips, and gives Majnu text about them, never the file", async () => {
    const events = await eventsOf(await POST(upload({ sessionId: session.id, message: "Für Mama" }, [{ bytes: JPEG, name: "regal.jpg" }])))
    const read = vi.mocked(readMessageFiles).mock.calls[0][0]
    expect(read.files).toHaveLength(0) // let go once read
    expect(read.session).toBe(session)
    expect(events[0]).toEqual({ type: "context", context: { ...session.context, notes: ["Spielt Saxofon", "Liebt Jazz"] } })

    const { state, message } = vi.mocked(runFinderTurn).mock.calls[0][0]
    expect(message).toBe("Für Mama")
    expect(state.sharedFiles).toEqual({ text: "<shared_files>\nThe visitor shared a photo. Notes from it:\n- Liebt Jazz\n</shared_files>", notes: ["Liebt Jazz"] })
    expect(state.sharedFiles?.text).not.toContain("regal.jpg")
    expect(saveFinderSession).toHaveBeenCalledWith(session, expect.objectContaining({ context: expect.objectContaining({ notes: ["Spielt Saxofon", "Liebt Jazz"] }) }))
  })

  it("answers a message of files alone", async () => {
    await eventsOf(await POST(upload({ message: "" }, [{ bytes: JPEG, name: "a.jpg" }])))
    expect(vi.mocked(runFinderTurn).mock.calls[0][0].message).toBe("")
  })

  it("calls no model when files alone could not be read, and says so", async () => {
    vi.mocked(readMessageFiles).mockResolvedValue({ outcomes: [{ kind: "image", status: "failed" }], notes: [] })
    const events = await eventsOf(await POST(upload({ message: "" }, [{ bytes: JPEG, name: "a.jpg" }])))
    expect(runFinderTurn).not.toHaveBeenCalled()
    expect(saveFinderSession).not.toHaveBeenCalled()
    expect(events.map((e) => e.type)).toEqual(["session", "error", "done"])
  })

  it("calls no model when files alone were all over a limit", async () => {
    vi.mocked(readMessageFiles).mockResolvedValue({ outcomes: [{ kind: "image", status: "not_read" }], notes: [] })
    await eventsOf(await POST(upload({ message: "" }, [{ bytes: JPEG, name: "a.jpg" }])))
    expect(runFinderTurn).not.toHaveBeenCalled()
  })
})
