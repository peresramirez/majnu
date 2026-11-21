// The page a recipient opens: majnu.app/l/<slug>.
//
// Always rendered on request, so calendar doors unlock on the right day and a
// letter edited a minute ago shows its new words. getPublicLetter() removes
// locked doors on the server; this page never sees their content. Titles and
// link previews stay generic ("A letter for Anna"): no message, no gift code.
import { cache } from "react"
import type { Metadata, Viewport } from "next"
import { notFound } from "next/navigation"
import { AudioNoteOverlay, type LetterAudio } from "@/components/letters/audio-note"
import { LetterRenderer } from "@/components/letters/registry"
import { OpenBeacon } from "@/components/letters/open-beacon"
import { letterMetadata, letterViewport } from "@/components/letters/page-meta"
import { publicAudioSrc } from "@/lib/audio/rules"
import { getPublicAudioNote } from "@/lib/audio/store"
import { getLatestDesignInfo } from "@/lib/daytona/designs"
import { getPublicLetter } from "@/lib/letters/store"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ slug: string }> }

// Slugs are short and URL-safe; anything else is not a letter, so skip the lookup.
const SLUG = /^[A-Za-z0-9_-]{1,64}$/

// One lookup per request, shared by the metadata, the viewport and the page.
const load = cache(async (slug: string) => (SLUG.test(slug) ? getPublicLetter(slug) : null))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return letterMetadata(await load(slug))
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
  const { slug } = await params
  return letterViewport(await load(slug))
}

// A design made in a Daytona sandbox, if the letter has one. Designs are an
// extra: if the lookup fails, the page falls back to its template.
async function designFor(slug: string) {
  try {
    return await getLatestDesignInfo(slug)
  } catch {
    return null
  }
}

// The sender's voice note, if the letter has one. Notes are an extra: if the
// lookup fails, the page shows without one. Only the URL, the length and the
// caption reach the page; the file streams from /l/<slug>/audio.
async function audioFor(slug: string): Promise<LetterAudio | null> {
  try {
    const note = await getPublicAudioNote(slug)
    return note ? { src: publicAudioSrc(slug, note.storagePath), seconds: note.seconds, caption: note.caption } : null
  } catch (error) {
    console.error("[audio] could not look up a note", error instanceof Error ? error.message : "unknown error")
    return null
  }
}

export default async function LetterPage({ params }: Props) {
  const { slug } = await params
  const letter = await load(slug)
  if (!letter) notFound()

  // Calendars never get a design (a static page would carry their locked
  // doors) or a voice note.
  const [design, audio] = letter.kind === "letter" ? await Promise.all([designFor(letter.slug), audioFor(letter.slug)]) : [null, null]
  if (design) {
    // The design is HTML influenced by the sender, so it runs in a sandboxed
    // frame from /l/<slug>/design (strict CSP there); the frame cannot reach
    // this page, its cookies or storage. ?v= makes a new design load fresh.
    return (
      <>
        <iframe
          src={`/l/${letter.slug}/design?v=${design.id}`}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          title={`A letter for ${letter.content.recipientName}`}
          className="fixed inset-0 h-[100svh] w-full border-0"
        />
        {audio && letter.kind === "letter" ? <AudioNoteOverlay audio={audio} senderName={letter.content.senderName} theme={letter.content.theme} /> : null}
        <OpenBeacon slug={letter.slug} ownerPreview={letter.ownerPreview} />
      </>
    )
  }

  return (
    <>
      <LetterRenderer letter={letter} audio={audio} />
      <OpenBeacon slug={letter.slug} ownerPreview={letter.ownerPreview} />
    </>
  )
}
