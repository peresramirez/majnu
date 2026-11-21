import type { Metadata } from "next"
import { GiftsView } from "@/components/app/gifts-view"
import { listMyLetters } from "@/lib/letters/store"

export const metadata: Metadata = { title: "My gifts" }
export const dynamic = "force-dynamic"

export default async function GiftsPage() {
  const letters = await listMyLetters()
  return <GiftsView letters={letters} now={new Date()} />
}
