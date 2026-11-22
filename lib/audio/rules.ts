// A voice note in a gift (issue #38): the rules shared by the recorder, the
// upload route, the audio routes and the player. No server-only code here, so
// the browser can import it. See docs/features/audio-note.md.

// The private Storage bucket (supabase/migrations/0008_audio_notes.sql).
export const AUDIO_NOTE_BUCKET = "audio-notes"

// Two minutes: long enough for a few warm sentences, short enough to listen to
// on the spot. The recorder stops by itself at the limit.
export const MAX_NOTE_SECONDS = 120
// The browser's clock may run a little past the limit before it stops. The
// database allows up to 125 seconds.
export const NOTE_DURATION_SLACK_SECONDS = 3
// Below this a tap on the microphone was a slip.
export const MIN_NOTE_SECONDS = 0.5

// Two minutes at the 48 kbit/s the recorder asks for is about 0.7 MB; iOS
// Safari's AAC can be several times that. 5 MB is the bucket's own limit too.
export const MAX_AUDIO_NOTE_BYTES = 5 * 1024 * 1024

// Per user per UTC day, counted in audio_note_uploads. Replacing a note counts
// as an upload; listening and removing do not.
export const AUDIO_NOTE_LIMITS = { uploadsPerDay: 10 } as const

// The formats a note may be stored in: what browsers record (webm/opus in
// Chrome and Android, mp4/AAC in Safari and newer Chrome, ogg/opus in Firefox)
// plus mp3. Nothing else is accepted.
export const AUDIO_NOTE_TYPES = ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg"] as const
export type AudioNoteType = (typeof AUDIO_NOTE_TYPES)[number]

// The file name ending for each stored format.
export const NOTE_EXTENSIONS: Record<AudioNoteType, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
}

// What MediaRecorder is asked for when recording a note, in order. mp4/AAC
// first, because every browser plays it, older iPhones included; then
// webm/opus (Chrome before mp4 recording, Firefox) and ogg/opus (Firefox).
export const NOTE_RECORDING_TYPES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
] as const

// "audio/webm;codecs=opus" → "audio/webm". Null for anything not accepted.
export function noteType(mimeType: string): AudioNoteType | null {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? ""
  return (AUDIO_NOTE_TYPES as readonly string[]).includes(base) ? (base as AudioNoteType) : null
}

// The longest caption kept (the database allows 4,000 characters).
export const MAX_CAPTION_CHARS = 4000

// Cleans a transcript for use as a caption: trimmed, spaces collapsed, cut at
// the limit. Null when nothing is left.
export function cleanCaption(text: string | null | undefined): string | null {
  if (typeof text !== "string") return null
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_CAPTION_CHARS).trim()
  return clean || null
}

// ---------- Range requests ----------

// What a Range header asks of a file of `size` bytes (RFC 9110, section 14).
// Only one byte range is served; a header with several ranges, another unit or
// a malformed value is ignored and the whole file is sent, as the RFC allows.
// `end` is inclusive.
export type RangeAnswer = { kind: "full" } | { kind: "partial"; start: number; end: number } | { kind: "unsatisfiable" }

export function parseRange(header: string | null | undefined, size: number): RangeAnswer {
  if (!header) return { kind: "full" }
  const match = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header)
  if (!match) return { kind: "full" }
  const [, first, last] = match
  if (!first && !last) return { kind: "full" }

  // "bytes=-500": the last 500 bytes.
  if (!first) {
    const suffix = Number(last)
    if (!Number.isSafeInteger(suffix) || suffix === 0 || size === 0) return { kind: "unsatisfiable" }
    return { kind: "partial", start: Math.max(0, size - suffix), end: size - 1 }
  }

  const start = Number(first)
  if (!Number.isSafeInteger(start)) return { kind: "full" }
  if (last) {
    const end = Number(last)
    if (!Number.isSafeInteger(end) || end < start) return { kind: "full" }
    if (start >= size) return { kind: "unsatisfiable" }
    return { kind: "partial", start, end: Math.min(end, size - 1) }
  }
  if (start >= size) return { kind: "unsatisfiable" }
  return { kind: "partial", start, end: size - 1 }
}

// ---------- What the owner's browser gets ----------

// A saved note, as POST and GET /api/letters/<id>/audio describe it. `src`
// plays it for the owner, whatever state the letter is in.
export type AudioNoteSummary = {
  seconds: number
  caption: string | null
  mimeType: AudioNoteType
  sizeBytes: number
  updatedAt: string
  src: string
}

// The version in a note's URL and its ETag: the random part of its file name,
// new for every upload, so a replaced note is never played from a cache.
export function noteVersion(storagePath: string): string {
  const name = storagePath.split("/").pop() ?? ""
  return name.split(".")[0] ?? ""
}

export function ownerAudioSrc(letterId: string, storagePath: string): string {
  return `/api/letters/${encodeURIComponent(letterId)}/audio/file?v=${encodeURIComponent(noteVersion(storagePath))}`
}

export function publicAudioSrc(slug: string, storagePath: string): string {
  return `/l/${encodeURIComponent(slug)}/audio?v=${encodeURIComponent(noteVersion(storagePath))}`
}

// ---------- What can go wrong, in the brand's voice (docs/brand.md) ----------

// Sent by /api/letters/<id>/audio as { error, message }.
export type AudioNoteErrorCode =
  | "session_required"
  | "not_found"
  | "not_a_letter"
  | "bad_request"
  | "empty"
  | "too_short"
  | "too_long"
  | "too_large"
  | "unsupported_format"
  | "daily_limit"
  | "failed"

export const AUDIO_NOTE_MESSAGES: Record<AudioNoteErrorCode, string> = {
  session_required: "Your session ended, so the voice note wasn't saved. Reload the page, then try again.",
  not_found: "This gift isn't yours or no longer exists.",
  not_a_letter: "Voice notes go on letters, gifts and invitations, not on calendars.",
  bad_request: "Something went wrong sending the voice note. Try again.",
  empty: "The recording was empty. Try again, a little closer to the microphone.",
  too_short: "That was too short to hear. Record a few words, then save.",
  too_long: "A voice note can be at most two minutes. Try a shorter one.",
  too_large: "That recording is too large to save. Try a shorter one.",
  unsupported_format: "This browser records in a format Majnu can't keep. Try another browser.",
  daily_limit: `You have saved ${AUDIO_NOTE_LIMITS.uploadsPerDay} voice notes today, the most for one day. Try again tomorrow.`,
  failed: "The voice note couldn't be saved just now. Try again in a moment.",
}

const ERROR_CODES = Object.keys(AUDIO_NOTE_MESSAGES) as AudioNoteErrorCode[]

export type NoteOutcome = { ok: true; note: AudioNoteSummary | null } | { ok: false; code: AudioNoteErrorCode | "offline"; message: string }

export const OFFLINE_MESSAGE = "The voice note didn't reach Majnu. Check your connection and try again."

// What the route answered, as an outcome for the recorder.
export function noteOutcome(status: number, body: unknown): NoteOutcome {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  if (status >= 200 && status < 300) {
    const note = record.note
    return { ok: true, note: isSummary(note) ? note : null }
  }
  const code = ERROR_CODES.find((known) => known === record.error)
  const message = typeof record.message === "string" && record.message.length <= 300 ? record.message : undefined
  const fallback: AudioNoteErrorCode =
    status === 401 ? "session_required" : status === 404 ? "not_found" : status === 413 ? "too_large" : status === 415 ? "unsupported_format" : status === 429 ? "daily_limit" : "failed"
  const known = code ?? fallback
  return { ok: false, code: known, message: message ?? AUDIO_NOTE_MESSAGES[known] }
}

function isSummary(value: unknown): value is AudioNoteSummary {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return typeof v.src === "string" && v.src.startsWith("/") && typeof v.seconds === "number" && Number.isFinite(v.seconds)
}

// ---------- Playback ----------

// How far through the note the player is, from 0 to 1. Browsers often report
// Infinity or NaN as the length of a recorded webm file, so the stored length
// stands in for it.
export function playbackFraction(current: number, duration: number | null | undefined, fallback?: number): number {
  const total = duration && Number.isFinite(duration) && duration > 0 ? duration : fallback && fallback > 0 ? fallback : 0
  if (!total || !Number.isFinite(current) || current <= 0) return 0
  return Math.min(1, current / total)
}

// The length to show: the browser's, if it knows it, else the stored one.
export function knownDuration(duration: number | null | undefined, fallback?: number): number | null {
  if (duration && Number.isFinite(duration) && duration > 0) return duration
  return fallback && fallback > 0 ? fallback : null
}
