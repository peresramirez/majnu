// majnu.app/l/<slug>/audio: the voice note in a gift (issue #38), streamed from
// our own domain so the gift page still loads nothing from other sites.
//
// Only for letters that exist, are letters (not calendars) and have content,
// as /l/<slug> shows them; 404 otherwise, with a plain body that says nothing
// about the letter. Range requests get correct 206 answers (Safari needs them
// to play audio/mp4). Cache-Control is private: a recipient's browser may keep
// the note for a few minutes, no shared proxy may.
import { audioNotFound, audioResponse } from "@/lib/audio/serve"
import { downloadAudio, getPublicAudioNote } from "@/lib/audio/store"
import { noteVersion } from "@/lib/audio/rules"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ slug: string }> }

const SLUG = /^[A-Za-z0-9_-]{6,64}$/

export async function GET(request: Request, { params }: Context): Promise<Response> {
  const { slug } = await params
  if (!SLUG.test(slug)) return audioNotFound()
  try {
    const note = await getPublicAudioNote(slug)
    if (!note) return audioNotFound()
    const body = await downloadAudio(note.storagePath)
    return audioResponse(request, { body, mimeType: note.mimeType, version: noteVersion(note.storagePath) })
  } catch (error) {
    console.error("[audio] could not serve a note", error instanceof Error ? error.message : "unknown error")
    return audioNotFound(500)
  }
}
