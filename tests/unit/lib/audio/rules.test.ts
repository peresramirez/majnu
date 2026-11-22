import { describe, expect, it } from "vitest"
import {
  AUDIO_NOTE_MESSAGES,
  cleanCaption,
  knownDuration,
  noteOutcome,
  noteType,
  noteVersion,
  ownerAudioSrc,
  parseRange,
  playbackFraction,
  publicAudioSrc,
} from "@/lib/audio/rules"

describe("noteType", () => {
  it("accepts the four formats, with or without parameters", () => {
    expect(noteType("audio/webm;codecs=opus")).toBe("audio/webm")
    expect(noteType("audio/mp4")).toBe("audio/mp4")
    expect(noteType("AUDIO/OGG; codecs=opus")).toBe("audio/ogg")
    expect(noteType("audio/mpeg")).toBe("audio/mpeg")
  })

  it("refuses everything else", () => {
    for (const type of ["audio/wav", "video/webm", "video/mp4", "audio/x-m4a", "text/html", "", "audio/webmx"]) {
      expect(noteType(type)).toBeNull()
    }
  })
})

describe("parseRange", () => {
  const size = 1000

  it("sends the whole file without a Range header", () => {
    expect(parseRange(null, size)).toEqual({ kind: "full" })
    expect(parseRange("", size)).toEqual({ kind: "full" })
  })

  it("answers the range Safari asks for first, bytes=0-1", () => {
    expect(parseRange("bytes=0-1", size)).toEqual({ kind: "partial", start: 0, end: 1 })
  })

  it("answers open-ended and closed ranges", () => {
    expect(parseRange("bytes=0-", size)).toEqual({ kind: "partial", start: 0, end: 999 })
    expect(parseRange("bytes=500-", size)).toEqual({ kind: "partial", start: 500, end: 999 })
    expect(parseRange("bytes=100-199", size)).toEqual({ kind: "partial", start: 100, end: 199 })
    expect(parseRange("bytes = 100 - 199", size)).toEqual({ kind: "partial", start: 100, end: 199 })
  })

  it("cuts a range that runs past the end", () => {
    expect(parseRange("bytes=900-5000", size)).toEqual({ kind: "partial", start: 900, end: 999 })
  })

  it("answers suffix ranges", () => {
    expect(parseRange("bytes=-100", size)).toEqual({ kind: "partial", start: 900, end: 999 })
    expect(parseRange("bytes=-5000", size)).toEqual({ kind: "partial", start: 0, end: 999 })
  })

  it("is unsatisfiable when the range starts at or after the end", () => {
    expect(parseRange("bytes=1000-", size)).toEqual({ kind: "unsatisfiable" })
    expect(parseRange("bytes=1000-1200", size)).toEqual({ kind: "unsatisfiable" })
    expect(parseRange("bytes=-0", size)).toEqual({ kind: "unsatisfiable" })
  })

  it("ignores what it does not serve: several ranges, other units, nonsense", () => {
    expect(parseRange("bytes=0-1,5-9", size)).toEqual({ kind: "full" })
    expect(parseRange("items=0-1", size)).toEqual({ kind: "full" })
    expect(parseRange("bytes=9-3", size)).toEqual({ kind: "full" })
    expect(parseRange("bytes=-", size)).toEqual({ kind: "full" })
    expect(parseRange("bytes=abc-", size)).toEqual({ kind: "full" })
    expect(parseRange("bytes=99999999999999999999-", size)).toEqual({ kind: "full" })
  })
})

describe("captions", () => {
  it("collapses spaces, trims, cuts at 4,000 characters and drops empty text", () => {
    expect(cleanCaption("  Hi   Anna,\n happy birthday. ")).toBe("Hi Anna, happy birthday.")
    expect(cleanCaption("   ")).toBeNull()
    expect(cleanCaption(null)).toBeNull()
    expect(cleanCaption("a".repeat(5000))).toHaveLength(4000)
  })
})

describe("note URLs", () => {
  const path = "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.m4a"

  it("version the URL with the file's random name, so a replaced note is never cached", () => {
    expect(noteVersion(path)).toBe("22222222-2222-4222-8222-222222222222")
    expect(publicAudioSrc("AbCdEf7890", path)).toBe("/l/AbCdEf7890/audio?v=22222222-2222-4222-8222-222222222222")
    expect(ownerAudioSrc("11111111-1111-4111-8111-111111111111", path)).toBe(
      "/api/letters/11111111-1111-4111-8111-111111111111/audio/file?v=22222222-2222-4222-8222-222222222222",
    )
  })
})

describe("noteOutcome", () => {
  const note = { seconds: 12, caption: null, mimeType: "audio/webm", sizeBytes: 100, updatedAt: "2026-11-22T10:00:00Z", src: "/api/letters/x/audio/file?v=y" }

  it("reads a saved note and an empty answer", () => {
    expect(noteOutcome(200, { note })).toEqual({ ok: true, note })
    expect(noteOutcome(200, { note: null })).toEqual({ ok: true, note: null })
    expect(noteOutcome(200, { ok: true, deleted: true })).toEqual({ ok: true, note: null })
  })

  it("never trusts a src that is not one of ours", () => {
    expect(noteOutcome(200, { note: { ...note, src: "https://evil.example/a.mp3" } })).toEqual({ ok: true, note: null })
  })

  it("uses the route's code and message, or falls back by status", () => {
    expect(noteOutcome(429, { error: "daily_limit", message: "Enough for today." })).toEqual({ ok: false, code: "daily_limit", message: "Enough for today." })
    expect(noteOutcome(415, null)).toEqual({ ok: false, code: "unsupported_format", message: AUDIO_NOTE_MESSAGES.unsupported_format })
    expect(noteOutcome(401, {})).toMatchObject({ code: "session_required" })
    expect(noteOutcome(500, "<html>")).toMatchObject({ code: "failed" })
  })
})

describe("playback", () => {
  it("uses the stored length while the browser reports Infinity for a recorded webm", () => {
    expect(playbackFraction(30, Number.POSITIVE_INFINITY, 60)).toBe(0.5)
    expect(playbackFraction(30, Number.NaN, 60)).toBe(0.5)
    expect(playbackFraction(30, 120, 60)).toBe(0.25)
    expect(playbackFraction(90, Number.POSITIVE_INFINITY, 60)).toBe(1)
    expect(playbackFraction(0, 60)).toBe(0)
    expect(playbackFraction(10, null)).toBe(0)
    expect(knownDuration(Number.POSITIVE_INFINITY, 42)).toBe(42)
    expect(knownDuration(41.5, 42)).toBe(41.5)
    expect(knownDuration(null)).toBeNull()
  })
})
