// Reading and checking an uploaded voice note, before anything is stored or
// counted. Used by POST /api/letters/<id>/audio; route files may only export
// their handlers, so this lives here.
//
// multipart/form-data with:
//   audio     the recording: audio/webm, audio/mp4, audio/ogg or audio/mpeg,
//             at most 5 MB
//   duration  its length in seconds, as measured by the browser, at most 120
//   language  the browser's languages, repeated, optional (caption hints)
import {
  MAX_AUDIO_NOTE_BYTES,
  MAX_NOTE_SECONDS,
  MIN_NOTE_SECONDS,
  NOTE_DURATION_SLACK_SECONDS,
  noteType,
  type AudioNoteErrorCode,
  type AudioNoteType,
} from "./rules"

// Room for the form's other fields and boundaries around the audio.
export const MAX_UPLOAD_BODY_BYTES = MAX_AUDIO_NOTE_BYTES + 64 * 1024

export type NoteUpload =
  | { ok: true; audio: Blob; mimeType: AudioNoteType; seconds: number; languages: unknown[] }
  | { ok: false; status: number; code: AudioNoteErrorCode }

// The body, or null as soon as it grows past `max`: a missing or false
// Content-Length must not make the Worker read an endless upload.
export async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export async function readNoteUpload(request: Request): Promise<NoteUpload> {
  const declared = Number(request.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BODY_BYTES) return { ok: false, status: 413, code: "too_large" }
  const raw = await readCapped(request, MAX_UPLOAD_BODY_BYTES)
  if (!raw) return { ok: false, status: 413, code: "too_large" }

  let form: FormData
  try {
    form = await new Response(raw as BodyInit, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData()
  } catch {
    return { ok: false, status: 400, code: "bad_request" }
  }

  const audio = form.get("audio")
  if (!(audio instanceof Blob)) return { ok: false, status: 400, code: "bad_request" }
  if (audio.size === 0) return { ok: false, status: 400, code: "empty" }
  if (audio.size > MAX_AUDIO_NOTE_BYTES) return { ok: false, status: 413, code: "too_large" }
  const mimeType = noteType(audio.type)
  if (!mimeType) return { ok: false, status: 415, code: "unsupported_format" }

  const seconds = Number(form.get("duration"))
  if (!Number.isFinite(seconds) || seconds <= 0) return { ok: false, status: 400, code: "bad_request" }
  if (seconds < MIN_NOTE_SECONDS) return { ok: false, status: 400, code: "too_short" }
  if (seconds > MAX_NOTE_SECONDS + NOTE_DURATION_SLACK_SECONDS) return { ok: false, status: 413, code: "too_long" }

  return { ok: true, audio, mimeType, seconds: Math.min(seconds, MAX_NOTE_SECONDS), languages: form.getAll("language") }
}
