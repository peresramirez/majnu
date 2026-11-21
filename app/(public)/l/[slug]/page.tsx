// The page a recipient opens: majnu.app/l/<slug>.
//
// Always rendered on request, so calendar doors unlock on the right day and a
// letter edited a minute ago shows its new words. getPublicLetter() removes
// locked doors on the server; this page never sees their content. Titles and
// link previews stay generic ("A letter for Anna"): no message, no gift code.
import { cache } from "react"
import type { Metadata, Viewport } from "next"
import { notFound } from "next/navigation"
import { LetterRenderer } from "@/components/letters/registry"
import { OpenBeacon } from "@/components/letters/open-beacon"
import { letterMetadata, letterViewport } from "@/components/letters/page-meta"
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

export default async function LetterPage({ params }: Props) {
  const { slug } = await params
  const letter = await load(slug)
  if (!letter) notFound()
  return (
    <>
      <LetterRenderer letter={letter} />
      <OpenBeacon slug={letter.slug} ownerPreview={letter.ownerPreview} />
    </>
  )
}
