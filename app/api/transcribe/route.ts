// POST /api/transcribe: one voice recording in, its text out (issue #37).
//
// multipart/form-data with:
//   audio     the recording (webm, mp4/m4a, mp3 or wav), at most 4 MB
//   duration  its length in seconds, as measured by the browser, at most 60
//   language  the browser's languages (navigator.languages), repeated, optional
//
// 200 { text } (text may be empty when no words were heard). Errors are
// { error, message } with a code from lib/voice/rules.ts: 401 session_required
// (any Supabase session will do, anonymous ones included), 403 cross-site,
// 400 bad_request or empty, 413 too_large or too_long, 415 unsupported_format,
// 429 daily_limit or site_busy, 503 unavailable, 502 failed.
//
// The audio goes to OpenAI and nowhere else: it is never stored, and neither
// it nor the text is ever logged. The key is OPENAI_API_KEY, or
// OPENAI_API_KEY_FALLBACK when the primary is refused for its key or quota
// (lib/providers); when neither can be used the answer is 429 site_busy.
import { isSameOriginPost } from "@/lib/billing/http"
import { createClient } from "@/lib/supabase/server"
import { ProviderUnavailableError } from "@/lib/providers/fallback"
import { TranscriptionError, hasTranscriptionKey, transcribe, transcribeModel } from "@/lib/voice/openai"
import {
  MAX_AUDIO_BYTES,
  MAX_RECORDING_SECONDS,
  VOICE_MESSAGES,
  audioExtension,
  dailyLimitMessage,
  languageHints,
  type TranscribeErrorCode,
} from "@/lib/voice/rules"
import { claimTranscription, releaseTranscription, settleTranscription } from "@/lib/voice/usage"

export const dynamic = "force-dynamic"

// Room for the form's other fields and boundaries around the audio.
const MAX_BODY_BYTES = MAX_AUDIO_BYTES + 64 * 1024
// The browser stops at 60 seconds; its clock may run a little past.
const DURATION_SLACK_SECONDS = 2

const NO_STORE = { "Cache-Control": "no-store" }

function fail(status: number, error: TranscribeErrorCode, message: string = VOICE_MESSAGES[error]): Response {
  return Response.json({ error, message }, { status, headers: NO_STORE })
}

// The body, or null as soon as it grows past `max`: a missing or false
// Content-Length must not make the Worker read an endless upload.
async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
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

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginPost(request)) return fail(403, "bad_request", "Cross-site request refused.")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail(401, "session_required")

  if (!hasTranscriptionKey()) {
    console.error("[transcribe] OPENAI_API_KEY is not set")
    return fail(503, "unavailable")
  }

  const declared = Number(request.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return fail(413, "too_large")
  const raw = await readCapped(request, MAX_BODY_BYTES)
  if (!raw) return fail(413, "too_large")

  let form: FormData
  try {
    form = await new Response(raw, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData()
  } catch {
    return fail(400, "bad_request")
  }

  const audio = form.get("audio")
  if (!(audio instanceof Blob)) return fail(400, "bad_request")
  if (audio.size === 0) return fail(400, "empty")
  if (audio.size > MAX_AUDIO_BYTES) return fail(413, "too_large")
  const extension = audioExtension(audio.type)
  if (!extension) return fail(415, "unsupported_format")

  const duration = Number(form.get("duration"))
  if (!Number.isFinite(duration) || duration <= 0) return fail(400, "bad_request")
  if (duration > MAX_RECORDING_SECONDS + DURATION_SLACK_SECONDS) return fail(413, "too_long")

  const languages = languageHints(form.getAll("language"))

  let claim: Awaited<ReturnType<typeof claimTranscription>>
  try {
    claim = await claimTranscription(user.id, duration)
  } catch (error) {
    console.error("[transcribe] could not check the limits", error instanceof Error ? error.message : "unknown error")
    return fail(502, "failed")
  }
  if (!claim.ok) {
    if (claim.reason === "site_cap") return fail(429, "site_busy")
    return fail(429, "daily_limit", dailyLimitMessage(claim.reason))
  }

  let text: string
  let seconds: number | null
  try {
    ;({ text, seconds } = await transcribe({ audio, filename: `recording.${extension}`, languages, model: transcribeModel() }, duration))
  } catch (error) {
    // Only the status and OpenAI's error code: never the audio or any text.
    const detail =
      error instanceof TranscriptionError ? `${error.status} ${error.code}` : error instanceof ProviderUnavailableError ? error.message : "unexpected error"
    console.error("[transcribe] transcription failed:", detail)
    try {
      await releaseTranscription(claim.id)
    } catch (releaseError) {
      console.error("[transcribe] could not release the claim", releaseError instanceof Error ? releaseError.message : "")
    }
    // Both keys refused, or the fallback's monthly cap reached.
    if (error instanceof ProviderUnavailableError) return fail(429, "site_busy")
    return fail(502, "failed")
  }

  try {
    await settleTranscription(claim.id, seconds ?? duration)
  } catch (error) {
    // The claim already counts the browser's length; the text is still good.
    console.error("[transcribe] could not record the length", error instanceof Error ? error.message : "")
  }

  return Response.json({ text }, { headers: NO_STORE })
}
