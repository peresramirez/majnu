import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { MoonPhase } from "@/components/brand/moon-phase"
import { LetterRenderer } from "@/components/letters/registry"
import { getMyLetter, toPublicView } from "@/lib/letters/store"

export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

// The owner's preview: every calendar door open, and no open tracking, because
// this page renders no beacon and is not /l/<slug>.
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
  return <LetterRenderer letter={view} />
}
