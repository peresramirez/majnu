import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import type { LetterAudio } from "@/components/letters/audio-note"
import { LetterRenderer } from "@/components/letters/registry"
import { ownerAudioSrc } from "@/lib/audio/rules"
import { getMyAudioNote } from "@/lib/audio/store"
import { getMyLetter, toPublicView } from "@/lib/letters/store"
import { createClient } from "@/lib/supabase/server"
import { BackLink } from "@/lib/navigation/use-back"

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
  // The page is full-bleed like /l/<slug>, so it needs its own way back
  // (the developer could not leave it): a small pill over the template, back
  // to where the owner came from, or to this gift's chat.
  return (
    <>
      <BackLink
        fallback={`/create/${letter.id}`}
        signedInFallback={`/create/${letter.id}`}
        aria-label="Back"
        className="fixed left-3 top-[max(12px,env(safe-area-inset-top))] z-[60] inline-flex h-10 items-center gap-1.5 rounded-full bg-[#1B1226]/80 px-3.5 text-sm font-medium text-[#F4E9EF] shadow-lg ring-1 ring-inset ring-white/20 backdrop-blur-md transition-colors hover:bg-[#1B1226] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8B19A]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </BackLink>
      <LetterRenderer letter={view} audio={audio} />
    </>
  )
}
