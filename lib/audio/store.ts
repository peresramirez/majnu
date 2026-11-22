// Voice notes: reading and writing the note of a letter (issue #38,
// supabase/migrations/0008_audio_notes.sql, docs/features/audio-note.md).
//
// - Ownership is always proved with the signed-in user's own client first
//   (row-level security on letters), then files and rows are written with the
//   service-role client: neither the bucket nor the table takes writes from a
//   browser.
// - Public reads (getPublicAudioNote) use the service-role client by exact
//   slug, like getPublicLetter(), and only for letters that have content.
// - Files are deleted through the Storage API only: the database queues the
//   path of every deleted or replaced note (audio_note_deletions), and
//   purgeDeletedAudio() removes those files and clears the queue.
import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { LetterContent, LetterTemplateId, type LetterKind } from "@/lib/letters/schema"
import { createAdminClient } from "@/lib/supabase/admin"
import { AUDIO_NOTE_BUCKET, AUDIO_NOTE_LIMITS, NOTE_EXTENSIONS, cleanCaption, ownerAudioSrc, type AudioNoteSummary, type AudioNoteType } from "./rules"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG = /^[A-Za-z0-9_-]{6,64}$/
const NOTE_COLUMNS = "id, letter_id, owner_id, storage_path, mime_type, size_bytes, duration_seconds, caption, updated_at"
// At most this many queued files are deleted per call, so a long backlog
// never makes one request slow.
const PURGE_BATCH = 20

type NoteRow = {
  id: string
  letter_id: string
  owner_id: string
  storage_path: string
  mime_type: string
  size_bytes: number
  duration_seconds: number | string
  caption: string | null
  updated_at: string
}

export type AudioNote = {
  id: string
  letterId: string
  ownerId: string
  storagePath: string
  mimeType: AudioNoteType
  sizeBytes: number
  seconds: number
  caption: string | null
  updatedAt: string
}

export function isLetterId(id: string): boolean {
  return UUID.test(id)
}

function toNote(row: NoteRow): AudioNote {
  return {
    id: row.id,
    letterId: row.letter_id,
    ownerId: row.owner_id,
    storagePath: row.storage_path,
    mimeType: row.mime_type as AudioNoteType,
    sizeBytes: Number(row.size_bytes),
    seconds: Number(row.duration_seconds),
    caption: row.caption,
    updatedAt: row.updated_at,
  }
}

// What the owner's browser is told about a note.
export function toSummary(note: AudioNote): AudioNoteSummary {
  return {
    seconds: note.seconds,
    caption: note.caption,
    mimeType: note.mimeType,
    sizeBytes: note.sizeBytes,
    updatedAt: note.updatedAt,
    src: ownerAudioSrc(note.letterId, note.storagePath),
  }
}

// ---------- Ownership ----------

export type OwnedLetterRef = { id: string; ownerId: string; slug: string; kind: LetterKind }

// The letter, if `userId` owns it. Read with the user's own client, so
// row-level security decides; the owner is compared as well.
export async function getOwnedLetter(supabase: SupabaseClient, letterId: string, userId: string): Promise<OwnedLetterRef | null> {
  if (!UUID.test(letterId)) return null
  const { data, error } = await supabase
    .from("letters")
    .select("id, owner_id, slug, kind")
    .eq("id", letterId)
    .maybeSingle<{ id: string; owner_id: string; slug: string; kind: string }>()
  if (error) throw new Error(`Could not check the letter: ${error.message}`)
  if (!data || data.owner_id !== userId) return null
  return { id: data.id, ownerId: data.owner_id, slug: data.slug, kind: data.kind === "calendar" ? "calendar" : "letter" }
}

// The note of one of the user's letters, read with their own client (RLS).
export async function getMyAudioNote(supabase: SupabaseClient, letterId: string): Promise<AudioNote | null> {
  if (!UUID.test(letterId)) return null
  const { data, error } = await supabase.from("letter_audio_notes").select(NOTE_COLUMNS).eq("letter_id", letterId).maybeSingle<NoteRow>()
  if (error) throw new Error(`Could not load the voice note: ${error.message}`)
  return data ? toNote(data) : null
}

// Every note of the user's letters, by letter id, for My gifts.
export async function listMyAudioNotes(supabase: SupabaseClient): Promise<Record<string, AudioNote>> {
  const { data, error } = await supabase.from("letter_audio_notes").select(NOTE_COLUMNS).returns<NoteRow[]>()
  if (error) throw new Error(`Could not load the voice notes: ${error.message}`)
  const notes: Record<string, AudioNote> = {}
  for (const row of data ?? []) notes[row.letter_id] = toNote(row)
  return notes
}

// ---------- The daily cap ----------

export type UploadClaim = { ok: true; id: string } | { ok: false }

export async function claimAudioUpload(userId: string): Promise<UploadClaim> {
  const { data, error } = await createAdminClient().rpc("claim_audio_note_upload", {
    p_user_id: userId,
    p_max_per_user: AUDIO_NOTE_LIMITS.uploadsPerDay,
  })
  if (error) throw new Error(`Could not check the voice note limit: ${error.message}`)
  const row = (Array.isArray(data) ? data[0] : data) as { claim_id?: unknown; refusal?: unknown } | null | undefined
  if (row && typeof row.claim_id === "string") return { ok: true, id: row.claim_id }
  if (row?.refusal === "user_count") return { ok: false }
  throw new Error("Could not check the voice note limit: unexpected answer")
}

// A failed upload does not count against the user.
export async function releaseAudioUpload(claimId: string): Promise<void> {
  const { error } = await createAdminClient().from("audio_note_uploads").delete().eq("id", claimId)
  if (error) throw new Error(`Could not release the upload: ${error.message}`)
}

// ---------- Saving, captioning and deleting ----------

export type NewNote = { letter: OwnedLetterRef; audio: Blob; mimeType: AudioNoteType; seconds: number }

// Uploads the file under a new random name, then points the letter's one note
// at it (an upsert on letter_id). If the letter had a note, the database
// queues its old file, which purgeDeletedAudio() then removes.
export async function saveAudioNote({ letter, audio, mimeType, seconds }: NewNote): Promise<AudioNote> {
  const admin = createAdminClient()
  const path = `${letter.id}/${crypto.randomUUID()}.${NOTE_EXTENSIONS[mimeType]}`

  const { error: uploadError } = await admin.storage
    .from(AUDIO_NOTE_BUCKET)
    .upload(path, audio, { contentType: mimeType, upsert: false, cacheControl: "300" })
  if (uploadError) throw new Error(`Could not store the voice note: ${uploadError.message}`)

  const { data, error } = await admin
    .from("letter_audio_notes")
    .upsert(
      {
        letter_id: letter.id,
        owner_id: letter.ownerId,
        storage_path: path,
        mime_type: mimeType,
        size_bytes: audio.size,
        duration_seconds: Math.round(seconds * 100) / 100,
        caption: null,
      },
      { onConflict: "letter_id" },
    )
    .select(NOTE_COLUMNS)
    .single<NoteRow>()
  if (error || !data) {
    // The file has no row: delete it now, or queue it if even that fails.
    await discardFile(path)
    throw new Error(`Could not save the voice note: ${error?.message ?? "no row"}`)
  }
  return toNote(data)
}

async function discardFile(path: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.storage.from(AUDIO_NOTE_BUCKET).remove([path])
  if (!error) return
  const { error: queueError } = await admin.from("audio_note_deletions").upsert({ storage_path: path }, { onConflict: "storage_path" })
  if (queueError) console.error("[audio] could not queue an orphaned file", queueError.message)
}

// Adds the caption to the note, unless the note has been replaced meanwhile.
export async function setAudioCaption(note: AudioNote, text: string): Promise<AudioNote> {
  const caption = cleanCaption(text)
  if (!caption) return note
  const { error } = await createAdminClient()
    .from("letter_audio_notes")
    .update({ caption })
    .eq("id", note.id)
    .eq("storage_path", note.storagePath)
  if (error) throw new Error(`Could not save the caption: ${error.message}`)
  return { ...note, caption }
}

// Removes the letter's note. True if there was one. The database queues its
// file; the caller then runs purgeDeletedAudio().
export async function deleteAudioNote(letterId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("letter_audio_notes").delete().eq("letter_id", letterId).select("id")
  if (error) throw new Error(`Could not remove the voice note: ${error.message}`)
  return Array.isArray(data) && data.length > 0
}

// Deletes the files of removed and replaced notes through the Storage API,
// then clears them from the queue. Returns how many were deleted. Safe to run
// any time: deleting a file that is already gone succeeds.
export async function purgeDeletedAudio(limit: number = PURGE_BATCH): Promise<number> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("audio_note_deletions")
    .select("storage_path")
    .order("queued_at", { ascending: true })
    .limit(limit)
    .returns<{ storage_path: string }[]>()
  if (error) throw new Error(`Could not read the deletion queue: ${error.message}`)
  const paths = (data ?? []).map((row) => row.storage_path)
  if (paths.length === 0) return 0

  const { error: removeError } = await admin.storage.from(AUDIO_NOTE_BUCKET).remove(paths)
  if (removeError) throw new Error(`Could not delete voice note files: ${removeError.message}`)

  const { error: clearError } = await admin.from("audio_note_deletions").delete().in("storage_path", paths)
  if (clearError) throw new Error(`Could not clear the deletion queue: ${clearError.message}`)
  return paths.length
}

// purgeDeletedAudio() for the routes: a failure is logged, never shown.
export async function purgeQuietly(): Promise<void> {
  try {
    await purgeDeletedAudio()
  } catch (error) {
    console.error("[audio] purge failed", error instanceof Error ? error.message : "unknown error")
  }
}

// ---------- Files ----------

export async function downloadAudio(storagePath: string): Promise<Blob> {
  const { data, error } = await createAdminClient().storage.from(AUDIO_NOTE_BUCKET).download(storagePath)
  if (error || !data) throw new Error(`Could not read the voice note: ${error?.message ?? "no file"}`)
  return data
}

// ---------- Public side ----------

// The note of the letter behind a public link, only if the letter exists, is a
// letter (not a calendar) and has content, exactly as /l/<slug> would show it.
export async function getPublicAudioNote(slug: string): Promise<AudioNote | null> {
  if (!SLUG.test(slug)) return null
  const admin = createAdminClient()
  const { data: letter, error } = await admin
    .from("letters")
    .select("id, kind, template_id, content")
    .eq("slug", slug)
    .maybeSingle<{ id: string; kind: string; template_id: string | null; content: unknown }>()
  if (error) throw new Error(`Could not load the letter: ${error.message}`)
  if (!letter || letter.kind !== "letter") return null
  if (!LetterTemplateId.safeParse(letter.template_id).success || !LetterContent.safeParse(letter.content).success) return null

  const { data, error: noteError } = await admin
    .from("letter_audio_notes")
    .select(NOTE_COLUMNS)
    .eq("letter_id", letter.id)
    .maybeSingle<NoteRow>()
  if (noteError) throw new Error(`Could not load the voice note: ${noteError.message}`)
  return data ? toNote(data) : null
}
