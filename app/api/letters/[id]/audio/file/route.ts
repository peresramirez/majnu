// The file of one of your letters' voice notes, for listening back (issue #38).
// Owner only, whatever state the letter is in, so a sender can hear a note
// before the page is built. Range requests work as on /l/<slug>/audio.
import { audioNotFound, audioResponse } from "@/lib/audio/serve"
import { downloadAudio, getMyAudioNote, isLetterId } from "@/lib/audio/store"
import { noteVersion } from "@/lib/audio/rules"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Context): Promise<Response> {
  const { id } = await params
  if (!isLetterId(id)) return audioNotFound()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return audioNotFound()
  try {
    // Row-level security returns only the user's own notes.
    const note = await getMyAudioNote(supabase, id)
    if (!note || note.ownerId !== user.id) return audioNotFound()
    const body = await downloadAudio(note.storagePath)
    return audioResponse(request, { body, mimeType: note.mimeType, version: noteVersion(note.storagePath) })
  } catch (error) {
    console.error("[audio] could not serve the owner's note", error instanceof Error ? error.message : "unknown error")
    return audioNotFound(500)
  }
}
