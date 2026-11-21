// Renders the letter's link-preview envelope. Shared by opengraph-image.tsx
// and twitter-image.tsx; see the first for what goes into it and why.
import { ImageResponse } from "next/og"
import { envelopeKind, envelopeName, OG_SIZE } from "@/components/letters/og-envelope"
import { EnvelopeImage } from "@/components/letters/og-envelope-image"
import { getPublicLetter } from "@/lib/letters/store"
import type { PublicLetter } from "@/lib/letters/schema"
import { gildaDisplay } from "./gilda-display"

const SLUG = /^[A-Za-z0-9_-]{1,64}$/

type Props = { params: Promise<{ slug: string }> }

export async function renderEnvelope({ params }: Props) {
  const { slug } = await params
  let letter: PublicLetter | null = null
  if (SLUG.test(slug)) {
    try {
      letter = await getPublicLetter(slug)
    } catch (error) {
      console.error("letter preview lookup failed", error instanceof Error ? error.message : error)
    }
  }
  return new ImageResponse(<EnvelopeImage name={envelopeName(letter)} kind={envelopeKind(letter)} />, {
    ...OG_SIZE,
    fonts: [{ name: "Gilda Display", data: gildaDisplay(), weight: 400, style: "normal" }],
    // Link previews are cached by the apps that show them; an hour here keeps a
    // renamed recipient from lingering long in anything in between.
    headers: { "Cache-Control": "public, max-age=3600" },
  })
}
