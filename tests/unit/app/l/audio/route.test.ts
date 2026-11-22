import { beforeEach, describe, expect, it, vi } from "vitest"
import { letterFixtures } from "@/lib/letters/fixtures"
import { createFakeSupabase } from "@/tests/unit/lib/audio/fake-supabase"

vi.mock("server-only", () => ({}))

let fake: ReturnType<typeof createFakeSupabase>
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fake.admin }))

import { GET } from "@/app/(public)/l/[slug]/audio/route"
import { getPublicAudioNote, purgeDeletedAudio } from "@/lib/audio/store"

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const LETTER = "11111111-1111-4111-8111-111111111111"
const PATH = `${LETTER}/22222222-2222-4222-8222-222222222222.m4a`
const bytes = Uint8Array.from({ length: 3000 }, (_, i) => i % 251)

function context(slug: string) {
  return { params: Promise.resolve({ slug }) }
}
function get(slug: string, headers: Record<string, string> = {}) {
  return GET(new Request(`http://localhost:3000/l/${slug}/audio`, { headers }), context(slug))
}

function seed(letter: Record<string, unknown> = {}) {
  fake = createFakeSupabase({
    letters: [
      {
        id: LETTER,
        owner_id: OWNER,
        slug: "AbCdEf7890",
        kind: "letter",
        template_id: "gift-reveal",
        content: letterFixtures["gift-reveal"],
        ...letter,
      },
    ],
    letter_audio_notes: [
      {
        id: "note-1",
        letter_id: LETTER,
        owner_id: OWNER,
        storage_path: PATH,
        mime_type: "audio/mp4",
        size_bytes: bytes.length,
        duration_seconds: "41.20",
        caption: "Happy birthday",
        updated_at: "2026-11-22T10:00:00Z",
      },
    ],
  })
  fake.files.set(PATH, new Blob([bytes], { type: "audio/mp4" }))
}

beforeEach(() => {
  seed()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("GET /l/<slug>/audio", () => {
  it("streams the whole note from our domain, private to the browser", async () => {
    const res = await get("AbCdEf7890")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("audio/mp4")
    expect(res.headers.get("content-length")).toBe("3000")
    expect(res.headers.get("accept-ranges")).toBe("bytes")
    expect(res.headers.get("cache-control")).toBe("private, max-age=300")
    expect(res.headers.get("etag")).toBe('"22222222-2222-4222-8222-222222222222"')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)
  })

  it("answers Range requests with 206 and the right bytes, and 416 past the end", async () => {
    const probe = await get("AbCdEf7890", { range: "bytes=0-1" })
    expect(probe.status).toBe(206)
    expect(probe.headers.get("content-range")).toBe("bytes 0-1/3000")
    expect(new Uint8Array(await probe.arrayBuffer())).toEqual(bytes.slice(0, 2))

    const rest = await get("AbCdEf7890", { range: "bytes=2000-" })
    expect(rest.status).toBe(206)
    expect(rest.headers.get("content-range")).toBe("bytes 2000-2999/3000")
    expect(new Uint8Array(await rest.arrayBuffer())).toEqual(bytes.slice(2000))

    const past = await get("AbCdEf7890", { range: "bytes=3000-" })
    expect(past.status).toBe(416)
    expect(past.headers.get("content-range")).toBe("bytes */3000")
  })

  it("is 404 for unknown and malformed slugs and for demo letters", async () => {
    for (const slug of ["NoSuchSlug1", "a", "../etc", "demo-gift"]) {
      const res = await get(slug)
      expect(res.status).toBe(404)
      expect(res.headers.get("cache-control")).toBe("no-store")
      expect(await res.text()).toBe("Not found")
    }
  })

  it("is 404 for a letter without content or template, with content that does not validate, and for calendars", async () => {
    for (const change of [{ content: null }, { template_id: null }, { content: { recipientName: "Anna" } }, { kind: "calendar", template_id: "countdown" }]) {
      seed(change)
      expect((await get("AbCdEf7890")).status).toBe(404)
    }
  })

  it("is 404 for a letter without a note", async () => {
    fake.tables.letter_audio_notes = []
    expect((await get("AbCdEf7890")).status).toBe(404)
  })

  it("goes with the letter: once it is deleted the note is 404 and the purge deletes the file", async () => {
    await fake.admin.from("letters").delete().eq("id", LETTER)
    expect((await get("AbCdEf7890")).status).toBe(404)
    expect(fake.tables.letter_audio_notes).toHaveLength(0)
    expect(fake.files.has(PATH)).toBe(true) // until the purge runs
    expect(await purgeDeletedAudio()).toBe(1)
    expect(fake.files.has(PATH)).toBe(false)
    expect(fake.tables.audio_note_deletions).toHaveLength(0)
  })

  it("is 500 with a plain body when Storage fails, without saying why", async () => {
    fake.files.delete(PATH)
    const res = await get("AbCdEf7890")
    expect(res.status).toBe(500)
    expect(await res.text()).toBe("Something went wrong")
  })
})

describe("getPublicAudioNote", () => {
  it("returns the note with its length as a number, for the page", async () => {
    const note = await getPublicAudioNote("AbCdEf7890")
    expect(note).toMatchObject({ letterId: LETTER, storagePath: PATH, seconds: 41.2, caption: "Happy birthday", mimeType: "audio/mp4" })
  })
})

describe("purgeDeletedAudio", () => {
  it("keeps the queue when Storage refuses, so nothing is forgotten", async () => {
    fake.tables.audio_note_deletions = [{ storage_path: PATH, queued_at: "2026-11-22T10:00:00Z" }]
    fake.failNext("storage.remove")
    await expect(purgeDeletedAudio()).rejects.toThrow()
    expect(fake.tables.audio_note_deletions).toHaveLength(1)
    expect(await purgeDeletedAudio()).toBe(1)
    expect(fake.tables.audio_note_deletions).toHaveLength(0)
  })

  it("deletes at most a batch at a time, oldest first", async () => {
    fake.tables.audio_note_deletions = Array.from({ length: 25 }, (_, i) => ({
      storage_path: `${LETTER}/${String(i).padStart(8, "0")}-0000-4000-8000-000000000000.webm`,
      queued_at: new Date(Date.UTC(2026, 10, 22, 0, 0, i)).toISOString(),
    }))
    expect(await purgeDeletedAudio()).toBe(20)
    expect(fake.tables.audio_note_deletions!.map((row) => row.storage_path)[0]).toContain("00000020")
    expect(await purgeDeletedAudio()).toBe(5)
    expect(await purgeDeletedAudio()).toBe(0)
  })
})
