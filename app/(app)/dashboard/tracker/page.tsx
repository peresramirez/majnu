import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getSignedInUser } from "@/components/app/session"
import { TRACKER_PATH } from "@/components/app/tracker/timeline"
import { TrackerInvite } from "@/components/app/tracker/tracker-invite"
import { TrackerView } from "@/components/app/tracker/tracker-view"
import { withNext } from "@/lib/billing/next-path"
import { listMyLetters } from "@/lib/letters/store"
import { listMyOpenEvents } from "@/lib/open/timeline"

export const metadata: Metadata = { title: "Tracker" }
export const dynamic = "force-dynamic"

// The Tracker tab (issue #49, docs/features/sharing-and-tracking.md): when,
// roughly where, in which language and on which device each gift was opened.
// Both reads use the owner's own session, so row-level security returns only
// their letters and those letters' events. Guests are invited to sign up first.
export default async function TrackerPage() {
  const user = await getSignedInUser()
  if (!user) redirect(withNext("/signin", TRACKER_PATH))
  if (user.isGuest) return <TrackerInvite />

  const [letters, events] = await Promise.all([listMyLetters(), listMyOpenEvents()])
  return <TrackerView letters={letters} events={events} now={new Date()} />
}
