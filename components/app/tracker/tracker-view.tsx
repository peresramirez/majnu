import Link from "next/link"
import { ArrowRight, CalendarDays, Mail } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { TemplateIcon } from "@/components/create/template-bits"
import type { LetterSummary } from "@/lib/letters/store"
import { getTemplate } from "@/lib/letters/templates"
import { displayName, shortDate } from "../format"
import { pagePadding, primaryButton } from "../styles"
import { TimeZoneNote } from "./time-zone-note"
import { TrackedGift, type TrackedGiftInfo } from "./tracked-gift"
import { eventsByLetter, type TrackedEvent } from "./timeline"

// The Tracker tab (issue #49): every gift, newest first, with whether and how
// often it was opened, and per gift a timeline of each open.
export const trackerContainer = `max-w-3xl ${pagePadding}`

export function TrackerView({ letters, events, now }: { letters: LetterSummary[]; events: TrackedEvent[]; now: Date }) {
  if (letters.length === 0) {
    return (
      <div className={trackerContainer}>
        <div className="mx-auto flex max-w-md flex-col items-start py-10 sm:py-16">
          <MoonPhase lit={0} size={40} className="text-night-lilac" />
          <h1 className="mt-6 font-display text-[40px] leading-[1.08]">Nothing to follow yet</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-night-lilac">
            Once you send a gift, you&apos;ll see here when it&apos;s opened, roughly where, and on which device.
          </p>
          <Link href="/dashboard/find" className={`mt-8 ${primaryButton}`}>
            Find a gift <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    )
  }

  const byLetter = eventsByLetter(events)
  const opened = letters.filter((l) => l.stats.totalOpens > 0 || byLetter.has(l.id)).length
  const nowIso = now.toISOString()

  return (
    <div className={trackerContainer}>
      <h1 className="font-display text-[34px] leading-tight md:text-[40px]">Tracker</h1>
      <p className="mt-1 text-night-lilac">
        {letters.length === 1 ? "1 gift" : `${letters.length} gifts`}, {opened} opened. <TimeZoneNote />
      </p>
      <ul className="mt-8 space-y-4">
        {letters.map((letter) => {
          const template = letter.templateId ? getTemplate(letter.templateId) : undefined
          const FallbackIcon = letter.kind === "calendar" ? CalendarDays : Mail
          const gift: TrackedGiftInfo = {
            id: letter.id,
            kind: letter.kind,
            name: letter.recipientName ? `For ${displayName(letter.recipientName)}` : letter.title ?? "A gift in progress",
            eyebrow: `${template?.name ?? "No design yet"} · ${shortDate(letter.createdAt, now)}`,
            hasContent: letter.hasContent,
            stats: letter.stats,
          }
          return (
            <li key={letter.id}>
              <TrackedGift
                gift={gift}
                events={byLetter.get(letter.id) ?? []}
                now={nowIso}
                icon={
                  letter.templateId ? (
                    <TemplateIcon id={letter.templateId} className="h-[18px] w-[18px]" />
                  ) : (
                    <FallbackIcon className="h-[18px] w-[18px]" aria-hidden="true" />
                  )
                }
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
