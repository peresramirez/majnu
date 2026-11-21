// The voice note of one of your letters (issue #38). Owner only: the session's
// user must own the letter, checked on the server with their own client (RLS).
// Guests (anonymous accounts) count as users, so they can add notes to the
// gifts they wrapped.
//
// GET     200 { note: AudioNoteSummary | null }
// POST    multipart (see lib/audio/upload.ts) → 200 { note }. Replaces the
//         letter's note if it had one; the old file is deleted.
// DELETE  200 { ok: true, deleted }. Removes the note and its file.
//
// Errors are { error, message } with a code from lib/audio/rules.ts: 401
// session_required, 403 cross-site, 404 not_found, 409 not_a_letter, 400
// bad_request / empty / too_short, 413 too_large / too_long, 415
// unsupported_format, 429 daily_limit, 502 failed. Every answer is no-store.
//
// The caption is made with the voice-input transcription when it can be; a
// note is saved without one otherwise. Neither the audio nor the caption is
// logged.
import { isSameOriginPost } from "@/lib/billing/http"
import { transcribeCaption } from "@/lib/audio/caption"
import { AUDIO_NOTE_MESSAGES, type AudioNoteErrorCode } from "@/lib/audio/rules"
import {
  claimAudioUpload,
  deleteAudioNote,
  getMyAudioNote,
  getOwnedLetter,
  isLetterId,
  purgeQuietly,
  releaseAudioUpload,
  saveAudioNote,
  setAudioCaption,
  toSummary,
  type AudioNote,
} from "@/lib/audio/store"
import { readNoteUpload } from "@/lib/audio/upload"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

const NO_STORE = { "Cache-Control": "no-store" }

function fail(status: number, error: AudioNoteErrorCode, message: string = AUDIO_NOTE_MESSAGES[error]): Response {
  return Response.json({ error, message }, { status, headers: NO_STORE })
}

function logError(what: string, error: unknown) {
  console.error(`[audio] ${what}`, error instanceof Error ? error.message : "unknown error")
}

async function session() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const { id } = await params
  const { supabase, user } = await session()
  if (!user) return fail(401, "session_required")
  if (!isLetterId(id)) return fail(404, "not_found")
  try {
    const letter = await getOwnedLetter(supabase, id, user.id)
    if (!letter) return fail(404, "not_found")
    const note = await getMyAudioNote(supabase, id)
    return Response.json({ note: note ? toSummary(note) : null }, { headers: NO_STORE })
  } catch (error) {
    logError("could not load the note", error)
    return fail(502, "failed")
  }
}

export async function POST(request: Request, { params }: Context): Promise<Response> {
  if (!isSameOriginPost(request)) return fail(403, "bad_request", "Cross-site request refused.")
  const { id } = await params
  const { supabase, user } = await session()
  if (!user) return fail(401, "session_required")
  if (!isLetterId(id)) return fail(404, "not_found")

  let letter: Awaited<ReturnType<typeof getOwnedLetter>>
  try {
    letter = await getOwnedLetter(supabase, id, user.id)
  } catch (error) {
    logError("could not check the letter", error)
    return fail(502, "failed")
  }
  if (!letter) return fail(404, "not_found")
  if (letter.kind !== "letter") return fail(409, "not_a_letter")

  const upload = await readNoteUpload(request)
  if (!upload.ok) return fail(upload.status, upload.code)

  let claim: Awaited<ReturnType<typeof claimAudioUpload>>
  try {
    claim = await claimAudioUpload(user.id)
  } catch (error) {
    logError("could not check the limit", error)
    return fail(502, "failed")
  }
  if (!claim.ok) return fail(429, "daily_limit")

  let note: AudioNote
  try {
    note = await saveAudioNote({ letter, audio: upload.audio, mimeType: upload.mimeType, seconds: upload.seconds })
  } catch (error) {
    logError("could not save the note", error)
    try {
      await releaseAudioUpload(claim.id)
    } catch (releaseError) {
      logError("could not release the claim", releaseError)
    }
    return fail(502, "failed")
  }

  // The replaced file, if any, and anything left from earlier.
  await purgeQuietly()

  const caption = await transcribeCaption({
    userId: user.id,
    audio: upload.audio,
    mimeType: upload.mimeType,
    seconds: upload.seconds,
    languages: upload.languages,
  })
  if (caption) {
    try {
      note = await setAudioCaption(note, caption)
    } catch (error) {
      logError("could not save the caption", error)
    }
  }

  return Response.json({ note: toSummary(note) }, { headers: NO_STORE })
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  if (!isSameOriginPost(request)) return fail(403, "bad_request", "Cross-site request refused.")
  const { id } = await params
  const { supabase, user } = await session()
  if (!user) return fail(401, "session_required")
  if (!isLetterId(id)) return fail(404, "not_found")
  try {
    const letter = await getOwnedLetter(supabase, id, user.id)
    if (!letter) return fail(404, "not_found")
    const deleted = await deleteAudioNote(letter.id)
    await purgeQuietly()
    return Response.json({ ok: true, deleted }, { headers: NO_STORE })
  } catch (error) {
    logError("could not remove the note", error)
    return fail(502, "failed")
  }
}
