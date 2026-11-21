import type { Metadata } from "next"
import { GiftsView } from "@/components/app/gifts-view"
import { listMyAudioNotes, toSummary } from "@/lib/audio/store"
import type { AudioNoteSummary } from "@/lib/audio/rules"
import { listMyGiftLists, type HostGiftList } from "@/lib/claims/owner"
import { listMyLetters } from "@/lib/letters/store"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "My gifts" }
export const dynamic = "force-dynamic"

// Gift lists are an extra on a few invitations: if they cannot be read, the
// tab still shows every gift.
async function giftLists(): Promise<Record<string, HostGiftList>> {
  try {
    return await listMyGiftLists()
  } catch (error) {
    console.error("could not load gift lists", error instanceof Error ? error.message : error)
    return {}
  }
}

// Voice notes are an extra too: if they cannot be read, each letter's
// recorder asks for its own note instead.
async function audioNotes(): Promise<Record<string, AudioNoteSummary> | undefined> {
  try {
    const notes = await listMyAudioNotes(await createClient())
    return Object.fromEntries(Object.entries(notes).map(([letterId, note]) => [letterId, toSummary(note)]))
  } catch (error) {
    console.error("could not load voice notes", error instanceof Error ? error.message : error)
    return undefined
  }
}

export default async function GiftsPage() {
  const [letters, lists, notes] = await Promise.all([listMyLetters(), giftLists(), audioNotes()])
  return <GiftsView letters={letters} giftLists={lists} audioNotes={notes} now={new Date()} />
}
