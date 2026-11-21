// One template, full-bleed, from fixture data. /dev/templates frames these in
// phone-sized boxes. Query: ?live=1 locks calendar doors as of today;
// ?palette=rose and ?font=script try the other moods.
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { LetterRenderer } from "@/components/letters/registry"
import { fixtureLetter, isTemplateId } from "../fixture-letter"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ live?: string; palette?: string; font?: string }>
}

export default async function DevTemplatePage({ params, searchParams }: Props) {
  const { id } = await params
  const q = await searchParams
  if (!isTemplateId(id)) notFound()
  const letter = fixtureLetter(id, { now: new Date(), live: q.live === "1", palette: q.palette, font: q.font })
  if (!letter) notFound()
  return <LetterRenderer letter={letter} />
}
