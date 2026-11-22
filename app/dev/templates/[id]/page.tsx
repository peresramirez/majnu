// One template, full-bleed, from fixture data. /dev/templates frames these in
// phone-sized boxes. Query:
//   ?live=1            lock calendar doors as of now
//   ?today=2026-12-12  lock calendar doors as of that date
//   ?days=3            countdown with that many doors (1 to 31)
//   ?event=0           invitation without its event
//   ?guest=1           as a guest sees it: the gift list's buttons work
//   ?audio=1           with the sample voice note (public/dev/voice-note.m4a):
//                      the voice player inside the template, once it is open
//   ?palette=rose, ?font=script  try the other moods
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { LetterRenderer } from "@/components/letters/registry"
import { fixtureLetter, isTemplateId, parseDays, parseToday, sampleAudio } from "../fixture-letter"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ live?: string; today?: string; days?: string; event?: string; guest?: string; audio?: string; palette?: string; font?: string }>
}

export default async function DevTemplatePage({ params, searchParams }: Props) {
  const { id } = await params
  const q = await searchParams
  if (!isTemplateId(id)) notFound()
  const letter = fixtureLetter(id, {
    now: new Date(),
    live: q.live === "1",
    today: parseToday(q.today),
    days: parseDays(q.days),
    noEvent: q.event === "0",
    guest: q.guest === "1",
    palette: q.palette,
    font: q.font,
  })
  if (!letter) notFound()
  return <LetterRenderer letter={letter} audio={q.audio === "1" ? sampleAudio() : null} />
}
