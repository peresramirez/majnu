import type { Metadata } from "next"
import { GiftsView } from "@/components/app/gifts-view"
import { listMyGiftLists, type HostGiftList } from "@/lib/claims/owner"
import { listMyLetters } from "@/lib/letters/store"

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

export default async function GiftsPage() {
  const [letters, lists] = await Promise.all([listMyLetters(), giftLists()])
  return <GiftsView letters={letters} giftLists={lists} now={new Date()} />
}
