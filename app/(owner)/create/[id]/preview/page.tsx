import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { MoonPhase } from "@/components/brand/moon-phase"
import type { LetterAudio } from "@/components/letters/audio-note"
import { LetterRenderer } from "@/components/letters/registry"
import { ownerAudioSrc } from "@/lib/audio/rules"
import { getMyAudioNote } from "@/lib/audio/store"
import { getMyLetter, toPublicView } from "@/lib/letters/store"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

// The owner's preview: every calendar door open, and no open tracking, because
// this page renders no beacon and is not /l/<slug>.

// The letter's voice note, played from the owner's own route. If it cannot be
// read, the preview shows without it.
async function audioFor(letterId: string): Promise<LetterAudio | null> {
  try {
    const note = await getMyAudioNote(await createClient(), letterId)
    return note ? { src: ownerAudioSrc(letterId, note.storagePath), seconds: note.seconds, caption: note.caption } : null
  } catch {
    return null
  }
}
export default async function OwnerPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const letter = await getMyLetter(id)
  if (!letter) notFound()

  const view = toPublicView(letter, new Date(), { ownerPreview: true })
  if (!view) {
    return (
      <div className="dark flex min-h-[100svh] flex-col items-center justify-center px-6 text-center text-night-petal">
        <MoonPhase lit={0} size={40} className="text-night-lilac" />
        <p className="mt-5 font-display text-2xl">Nothing to see yet</p>
        <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-night-lilac">
          The page appears here once Majnu has built it.
        </p>
      </div>
    )
  }
  const audio = view.kind === "letter" ? await audioFor(letter.id) : null
  return <LetterRenderer letter={view} audio={audio} />
}
