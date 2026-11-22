import type { Metadata } from "next"
import { SharedFinderPanel } from "@/components/finder/finder-panel"

export const metadata: Metadata = { title: "Find a gift" }

// The Find a gift tab, the app's first screen (issue #47): the gift finder
// inline. Its state lives in the app shell (FinderProvider), so a conversation
// survives a visit to another tab.
export default function FindPage() {
  return <SharedFinderPanel />
}
