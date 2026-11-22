import type { Metadata } from "next"
import { PageBackLink } from "@/components/app/page-back-link"
import { getSignedInUser } from "@/components/app/session"
import { CalendarGuestGate } from "@/components/calendars/guest-gate"
import { CalendarSetupForm } from "@/components/calendars/setup-form"

export const metadata: Metadata = { title: "New calendar" }
export const dynamic = "force-dynamic"

// Starting an advent calendar or countdown filled door by door (issue #48).
// The app layout has already sent visitors without a session to /signin.
export default async function NewCalendarPage() {
  const user = await getSignedInUser()
  if (!user || user.isGuest) return <CalendarGuestGate next="/dashboard/calendars/new" />
  const firstName = user.name?.trim().split(/\s+/)[0] ?? ""
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8 sm:px-6 md:pt-12">
      <PageBackLink fallback="/dashboard/create" className="mb-3" />
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-night-lilac">Advent calendar</p>
      <h1 className="mt-2 font-display text-[36px] leading-[1.06] md:text-[48px]">A small gift behind every door</h1>
      <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-night-lilac">
        Tell Majnu who it is for. Majnu finds small gifts for them, and you choose one for each door, add your own, or leave a note.
      </p>
      <div className="mt-10">
        <CalendarSetupForm senderName={firstName} />
      </div>
    </div>
  )
}
