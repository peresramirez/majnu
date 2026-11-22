// /pitch: Majnu's pitch deck, behind a light password (issue #76).
//
// Until the request carries the cookie from /pitch/unlock, the server renders
// only the password screen: none of the deck's words are in the HTML or the
// RSC payload. The slides, and even the controls' labels, live in server-only
// modules, so no JavaScript file carries them either. Reading the cookie
// makes the page dynamic, which Next.js sends with
// `Cache-Control: private, no-cache, no-store`.
import { cookies } from "next/headers"
import { Deck } from "@/components/pitch/deck"
import { PasswordScreen } from "@/components/pitch/password-screen"
import { DECK_LABELS, pitchSlides } from "@/components/pitch/slides"
import { PITCH_COOKIE, isUnlocked } from "@/lib/pitch/gate"

export const dynamic = "force-dynamic"

export default async function PitchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const cookie = (await cookies()).get(PITCH_COOKIE)?.value
  if (!(await isUnlocked(cookie))) {
    const { wrong } = await searchParams
    return <PasswordScreen wrong={wrong === "1"} />
  }
  return <Deck slides={pitchSlides()} labels={DECK_LABELS} />
}
