import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createFakeSupabase } from "@/tests/unit/lib/audio/fake-supabase"

vi.mock("server-only", () => ({}))

let fake: ReturnType<typeof createFakeSupabase>
let user: { id: string; is_anonymous?: boolean } | null

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: (name: string) => fake.userClient(user?.id ?? null).from(name),
  }),
}))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fake.admin }))

import { DELETE, GET, POST } from "@/app/api/letters/[id]/audio/route"
import { GET as GET_FILE } from "@/app/api/letters/[id]/audio/file/route"
import { AUDIO_NOTE_LIMITS, MAX_AUDIO_NOTE_BYTES } from "@/lib/audio/rules"

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const STRANGER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const LETTER = "11111111-1111-4111-8111-111111111111"
const CALENDAR = "33333333-3333-4333-8333-333333333333"
const CAPTION = "Hi Anna, happy birthday. I miss you."

let uploads: number
const openai = vi.fn()

function context(id = LETTER) {
  return { params: Promise.resolve({ id }) }
}

type Fields = { audio?: Blob | null; duration?: string | null; filename?: string }

function upload({ audio, duration = "12.40", filename = "note.webm" }: Fields = {}, headers: Record<string, string> = {}, id = LETTER) {
  const form = new FormData()
  const file = audio === undefined ? new Blob([new Uint8Array(4096).fill(5)], { type: "audio/webm;codecs=opus" }) : audio
  if (file) form.append("audio", file, filename)
  if (duration !== null) form.append("duration", duration)
  form.append("language", "en-GB")
  return new Request(`http://localhost:3000/api/letters/${id}/audio`, { method: "POST", body: form, headers })
}

function remove(headers: Record<string, string> = {}, id = LETTER) {
  return new Request(`http://localhost:3000/api/letters/${id}/audio`, { method: "DELETE", headers })
}

async function json(res: Response) {
  return (await res.json()) as Record<string, any>
}

const notes = () => fake.tables.letter_audio_notes ?? []
const queue = () => (fake.tables.audio_note_deletions ?? []).map((row) => row.storage_path)

let errors: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000")
  vi.stubEnv("OPENAI_API_KEY", "sk-test-key")
  vi.stubEnv("MAJNU_TRANSCRIBE_MODEL", "")
  vi.stubEnv("MAJNU_DAILY_VOICE_CAP", "")
  user = { id: OWNER }
  uploads = 0
  fake = createFakeSupabase({
    letters: [
      { id: LETTER, owner_id: OWNER, slug: "AbCdEf7890", kind: "letter" },
      { id: CALENDAR, owner_id: OWNER, slug: "CaLeNdAr42", kind: "calendar" },
    ],
  })
  fake.onRpc("claim_audio_note_upload", (args) => {
    if (uploads >= Number(args.p_max_per_user)) return { data: [{ claim_id: null, refusal: "user_count" }], error: null }
    uploads++
    const id = crypto.randomUUID()
    ;(fake.tables.audio_note_uploads ??= []).push({ id, user_id: args.p_user_id })
    return { data: [{ claim_id: id, refusal: null }], error: null }
  })
  fake.onRpc("claim_voice_transcription", () => ({ data: [{ claim_id: "voice-claim", refusal: null }], error: null }))
  openai.mockReset()
  openai.mockImplementation(async () => Response.json({ text: CAPTION, usage: { type: "duration", seconds: 13 } }))
  vi.stubGlobal("fetch", openai)
  errors = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  errors.mockRestore()
})

describe("POST /api/letters/<id>/audio", () => {
  it("stores the file in the private bucket and one row for the letter, with the caption", async () => {
    const res = await POST(upload(), context())
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    const { note } = await json(res)
    expect(note).toMatchObject({ seconds: 12.4, caption: CAPTION, mimeType: "audio/webm", sizeBytes: 4096 })
    expect(note.src).toMatch(new RegExp(`^/api/letters/${LETTER}/audio/file\\?v=[0-9a-f-]{36}$`))

    expect(notes()).toHaveLength(1)
    const row = notes()[0]!
    expect(row).toMatchObject({ letter_id: LETTER, owner_id: OWNER, mime_type: "audio/webm", size_bytes: 4096, duration_seconds: 12.4, caption: CAPTION })
    expect(row.storage_path).toMatch(new RegExp(`^${LETTER}/[0-9a-f-]{36}\\.webm$`))
    const stored = fake.files.get(String(row.storage_path))!
    expect(stored.type).toBe("audio/webm")
    expect(stored.size).toBe(4096)
  })

  it("sends OpenAI the note for its caption, within the voice limits", async () => {
    await POST(upload(), context())
    expect(fake.log).toContain("rpc claim_voice_transcription")
    expect(openai).toHaveBeenCalledTimes(1)
    const [url, init] = openai.mock.calls[0]!
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions")
    const form = init.body as FormData
    expect((form.get("file") as File).name).toBe("note.webm")
    expect(form.getAll("languages[]")).toEqual(["en"])
  })

  it("keeps one note per letter: a new recording replaces the old one and deletes its file", async () => {
    await POST(upload(), context())
    const first = String(notes()[0]!.storage_path)
    expect(fake.files.has(first)).toBe(true)

    const res = await POST(upload({ audio: new Blob([new Uint8Array(2048)], { type: "audio/mp4" }), filename: "note.m4a", duration: "30" }), context())
    expect(res.status).toBe(200)
    expect(notes()).toHaveLength(1)
    const second = String(notes()[0]!.storage_path)
    expect(second).not.toBe(first)
    expect(second).toMatch(/\.m4a$/)
    expect(notes()[0]).toMatchObject({ mime_type: "audio/mp4", size_bytes: 2048, duration_seconds: 30 })
    expect(fake.files.has(first)).toBe(false)
    expect(fake.files.has(second)).toBe(true)
    expect(queue()).toEqual([])
  })

  it("lets guests (anonymous accounts) add a note to their own gift", async () => {
    user = { id: OWNER, is_anonymous: true }
    expect((await POST(upload(), context())).status).toBe(200)
  })

  it("saves the note without a caption when transcription fails or is off", async () => {
    openai.mockImplementation(async () => Response.json({ error: { code: "server_error" } }, { status: 500 }))
    const res = await POST(upload(), context())
    expect(res.status).toBe(200)
    expect((await json(res)).note.caption).toBeNull()
    expect(notes()[0]!.caption).toBeNull()
    expect(fake.log).toContain("voice_transcriptions.delete") // the voice claim is released

    vi.stubEnv("OPENAI_API_KEY", "")
    openai.mockClear()
    const again = await POST(upload(), context())
    expect(again.status).toBe(200)
    expect(openai).not.toHaveBeenCalled()
  })

  it("does not caption ogg, which OpenAI cannot read", async () => {
    const res = await POST(upload({ audio: new Blob([new Uint8Array(100)], { type: "audio/ogg;codecs=opus" }), filename: "note.ogg" }), context())
    expect(res.status).toBe(200)
    expect(openai).not.toHaveBeenCalled()
    expect(String(notes()[0]!.storage_path)).toMatch(/\.ogg$/)
  })

  it("never logs the caption", async () => {
    openai.mockImplementation(async () => Response.json({ text: CAPTION }))
    fake.failNext("letter_audio_notes.update")
    await POST(upload(), context())
    for (const call of errors.mock.calls) expect(call.map(String).join(" ")).not.toContain("Anna")
  })

  it("refuses without a session (401), from another site (403) and for a malformed id (404)", async () => {
    user = null
    expect((await POST(upload(), context())).status).toBe(401)
    user = { id: OWNER }
    const cross = await POST(upload({}, { origin: "https://evil.example" }), context())
    expect(cross.status).toBe(403)
    expect((await POST(upload({}, {}, "not-a-uuid"), context("not-a-uuid"))).status).toBe(404)
    expect(notes()).toHaveLength(0)
  })

  it("refuses a letter the user does not own, as if it did not exist", async () => {
    user = { id: STRANGER }
    const res = await POST(upload(), context())
    expect(res.status).toBe(404)
    expect((await json(res)).error).toBe("not_found")
    expect(notes()).toHaveLength(0)
    expect(fake.files.size).toBe(0)
    expect(fake.log).not.toContain("rpc claim_audio_note_upload")
  })

  it("refuses calendars (409)", async () => {
    const res = await POST(upload({}, {}, CALENDAR), context(CALENDAR))
    expect(res.status).toBe(409)
    expect((await json(res)).error).toBe("not_a_letter")
  })

  it("accepts only webm, mp4, ogg and mpeg (415)", async () => {
    for (const type of ["audio/wav", "video/mp4", "application/octet-stream", ""]) {
      const res = await POST(upload({ audio: new Blob([new Uint8Array(10)], { type }) }), context())
      expect(res.status).toBe(415)
      expect((await json(res)).error).toBe("unsupported_format")
    }
    expect(notes()).toHaveLength(0)
  })

  it("refuses more than 5 MB, by the file and by Content-Length (413)", async () => {
    const big = await POST(upload({ audio: new Blob([new Uint8Array(MAX_AUDIO_NOTE_BYTES + 1)], { type: "audio/webm" }) }), context())
    expect(big.status).toBe(413)
    expect((await json(big)).error).toBe("too_large")
    const declared = await POST(upload({}, { "content-length": String(MAX_AUDIO_NOTE_BYTES + 100_000) }), context())
    expect(declared.status).toBe(413)
    expect(fake.files.size).toBe(0)
  })

  it("refuses more than two minutes (413), too short, empty and missing fields (400)", async () => {
    expect(await json(await POST(upload({ duration: "124" }), context()))).toMatchObject({ error: "too_long" })
    expect((await POST(upload({ duration: "122.5" }), context())).status).toBe(200)
    expect(await json(await POST(upload({ duration: "0.2" }), context()))).toMatchObject({ error: "too_short" })
    expect(await json(await POST(upload({ duration: null }), context()))).toMatchObject({ error: "bad_request" })
    expect(await json(await POST(upload({ audio: null }), context()))).toMatchObject({ error: "bad_request" })
    expect(await json(await POST(upload({ audio: new Blob([], { type: "audio/webm" }) }), context()))).toMatchObject({ error: "empty" })
  })

  it("stops at the daily cap (429) before storing anything", async () => {
    for (let i = 0; i < AUDIO_NOTE_LIMITS.uploadsPerDay; i++) expect((await POST(upload(), context())).status).toBe(200)
    const filesBefore = fake.files.size
    const res = await POST(upload(), context())
    expect(res.status).toBe(429)
    expect((await json(res)).error).toBe("daily_limit")
    expect(fake.files.size).toBe(filesBefore)
  })

  it("releases the day's claim and stores nothing when the upload fails", async () => {
    fake.failNext("storage.upload")
    const res = await POST(upload(), context())
    expect(res.status).toBe(502)
    expect(fake.tables.audio_note_uploads ?? []).toHaveLength(0)
    expect(notes()).toHaveLength(0)
  })

  it("deletes the file again when its row cannot be written", async () => {
    fake.failNext("letter_audio_notes.upsert")
    const res = await POST(upload(), context())
    expect(res.status).toBe(502)
    expect(fake.files.size).toBe(0)
    expect(notes()).toHaveLength(0)
    expect(fake.tables.audio_note_uploads ?? []).toHaveLength(0)
  })

  it("queues the orphaned file when even that fails, for the next purge", async () => {
    fake.failNext("letter_audio_notes.upsert")
    fake.failNext("storage.remove")
    await POST(upload(), context())
    expect(queue()).toHaveLength(1)
    // The next upload purges it.
    await POST(upload(), context())
    expect(queue()).toEqual([])
    expect(fake.files.size).toBe(1)
  })
})

describe("GET /api/letters/<id>/audio", () => {
  it("describes the owner's note, or null", async () => {
    expect(await json(await GET(new Request("http://localhost/x"), context()))).toEqual({ note: null })
    await POST(upload(), context())
    const { note } = await json(await GET(new Request("http://localhost/x"), context()))
    expect(note).toMatchObject({ seconds: 12.4, caption: CAPTION })
  })

  it("is 409 for a calendar, so a recorder that does not know the kind hides itself", async () => {
    const res = await GET(new Request("http://localhost/x"), context(CALENDAR))
    expect(res.status).toBe(409)
    expect((await json(res)).error).toBe("not_a_letter")
  })

  it("is 401 signed out and 404 for someone else's letter", async () => {
    await POST(upload(), context())
    user = null
    expect((await GET(new Request("http://localhost/x"), context())).status).toBe(401)
    user = { id: STRANGER }
    expect((await GET(new Request("http://localhost/x"), context())).status).toBe(404)
  })
})

describe("GET /api/letters/<id>/audio/file", () => {
  it("streams the owner's note with Range support, and nothing to anyone else", async () => {
    await POST(upload(), context())
    const full = await GET_FILE(new Request("http://localhost/x"), context())
    expect(full.status).toBe(200)
    expect(full.headers.get("content-type")).toBe("audio/webm")
    expect(full.headers.get("content-length")).toBe("4096")
    const part = await GET_FILE(new Request("http://localhost/x", { headers: { range: "bytes=0-1" } }), context())
    expect(part.status).toBe(206)
    expect(part.headers.get("content-range")).toBe("bytes 0-1/4096")

    user = { id: STRANGER }
    expect((await GET_FILE(new Request("http://localhost/x"), context())).status).toBe(404)
    user = null
    expect((await GET_FILE(new Request("http://localhost/x"), context())).status).toBe(404)
  })
})

describe("DELETE /api/letters/<id>/audio", () => {
  it("removes the note and its file", async () => {
    await POST(upload(), context())
    const path = String(notes()[0]!.storage_path)
    const res = await DELETE(remove(), context())
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ ok: true, deleted: true })
    expect(notes()).toHaveLength(0)
    expect(fake.files.has(path)).toBe(false)
    expect(queue()).toEqual([])
    expect(await json(await DELETE(remove(), context()))).toEqual({ ok: true, deleted: false })
  })

  it("refuses someone else's letter, signed-out visitors and other sites", async () => {
    await POST(upload(), context())
    user = { id: STRANGER }
    expect((await DELETE(remove(), context())).status).toBe(404)
    user = null
    expect((await DELETE(remove(), context())).status).toBe(401)
    user = { id: OWNER }
    expect((await DELETE(remove({ origin: "https://evil.example" }), context())).status).toBe(403)
    expect(notes()).toHaveLength(1)
  })

  it("leaves the queue for the next purge when Storage is down, and says it worked", async () => {
    await POST(upload(), context())
    fake.failNext("storage.remove")
    const res = await DELETE(remove(), context())
    expect(res.status).toBe(200)
    expect(notes()).toHaveLength(0)
    expect(queue()).toHaveLength(1)
  })
})
