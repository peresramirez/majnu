import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getSignedInUser } from "@/components/app/session"
import { primaryButton } from "@/components/app/styles"
import { CalendarEditor } from "@/components/calendars/editor"
import { CalendarGuestGate } from "@/components/calendars/guest-gate"
import { getMyCalendarSession } from "@/lib/calendars/sessions"
import type { CalendarEditorData } from "@/lib/calendars/types"
import { CalendarContent, CalendarTemplateId } from "@/lib/letters/schema"
import { getMyLetter } from "@/lib/letters/store"

// Generic on purpose: titles end up in browser history and shared screenshots.
export const metadata: Metadata = { title: "Your calendar" }
export const dynamic = "force-dynamic"

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ideas?: string }> }

// The editor for a calendar filled door by door (issue #48). Everything here is
// the owner's own: the letter is read through row-level security, and every
// door is shown, locked or not, as in the owner's preview.
export default async function CalendarEditorPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const user = await getSignedInUser()
  if (!user || user.isGuest) return <CalendarGuestGate next={`/dashboard/calendars/${encodeURIComponent(id)}`} />

  const letter = await getMyLetter(id)
  const content = letter?.kind === "calendar" ? CalendarContent.safeParse(letter.content) : null
  const templateId = CalendarTemplateId.safeParse(letter?.templateId)
  if (!letter || !content?.success || !templateId.success) notFound()

  const session = await getMyCalendarSession(letter.id)
  if (!session) {
    // Made in the letters chat: it has no pool and no setup, and is edited there.
    return (
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-16 sm:px-6">
        <h1 className="font-display text-[32px] leading-tight">This calendar was made in a chat</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-night-lilac">Change its doors by telling Majnu what you would like there.</p>
        <Link href={`/create/${letter.id}`} className={`mt-8 ${primaryButton}`}>
          Open the chat
        </Link>
      </div>
    )
  }

  const data: CalendarEditorData = {
    letterId: letter.id,
    slug: letter.slug,
    templateId: templateId.data,
    content: content.data,
    pool: session.pool?.options ?? [],
    lastDoorId: session.pool?.recommendedId || null,
    setup: {
      relationship: session.context.relationship ?? "",
      doorBudget: session.marker.doorBudget,
      ...(session.marker.lastDoorBudget ? { lastDoorBudget: session.marker.lastDoorBudget } : {}),
      ...(session.context.country ? { country: session.context.country } : {}),
    },
  }
  return <CalendarEditor key={letter.id} data={data} autoFind={query.ideas === "1"} />
}
