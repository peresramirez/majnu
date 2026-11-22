import Link from "next/link"
import { ArrowRight, CalendarDays, CircleHelp, Globe2, Mail, Monitor, Smartphone, Tablet } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { TemplateIcon } from "@/components/create/template-bits"
import type { LetterSummary } from "@/lib/letters/store"
import { getTemplate } from "@/lib/letters/templates"
import { displayName, shortDate } from "../format"
import { pagePadding, primaryButton, secondaryButton } from "../styles"
import { countryBreakdown, deviceBreakdown, isOpen, languageBreakdown, trackerTotals, type Slice } from "./analytics"
import { BreakdownCard } from "./breakdown-card"
import { cardSurface, formatCount } from "./card"
import { HeadlineNumbers } from "./headline-numbers"
import { OpensByHour, OpensPerDay } from "./time-charts"
import { TimeZoneNote } from "./time-zone-note"
import { TrackedGift, type TrackedGiftInfo } from "./tracked-gift"
import { countryFlag, eventsByLetter, type TrackedEvent } from "./timeline"

// The Tracker tab (issues #49 and #75): an analytics dashboard of how the
// sender's gifts are being opened. Headline numbers, opens per day and by the
// hour, where, on what and in which language, then every gift with its own
// numbers and timeline. Before the first open it is the same dashboard at
// zero, with an invitation to send a gift.
export const trackerContainer = `max-w-5xl ${pagePadding}`

export function TrackerView({ letters, events, now }: { letters: LetterSummary[]; events: TrackedEvent[]; now: Date }) {
  const totals = trackerTotals(letters, events)
  const byLetter = eventsByLetter(events)
  const opens = events.filter(isOpen)
  const openTimes = opens.map((event) => event.at)
  const nowIso = now.toISOString()

  return (
    <div className={trackerContainer}>
      <h1 className="font-display text-[34px] leading-tight md:text-[40px]">Tracker</h1>
      <p className="mt-1 text-night-lilac">
        How your gifts are being opened. <TimeZoneNote />
      </p>

      {totals.opens === 0 && <Invitation sent={totals.giftsSent} />}

      <section aria-labelledby="tracker-overview" className="mt-6 md:mt-8">
        <h2 id="tracker-overview" className="sr-only">
          Overview
        </h2>
        <HeadlineNumbers totals={totals} />
      </section>

      <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
        <OpensPerDay times={openTimes} now={nowIso} className="md:col-span-2" />
        <BreakdownCard
          id="tracker-countries"
          title="Countries"
          subtitle="Where gifts were opened"
          slices={countryBreakdown(events)}
          emptyText="The country of each open shows here, from the network it came from."
          marker={countryMarker}
        />
        <OpensByHour times={openTimes} />
        <BreakdownCard
          id="tracker-devices"
          title="Devices"
          subtitle="What gifts were opened on"
          slices={deviceBreakdown(events)}
          emptyText="Phones, tablets and computers show here after the first open."
          marker={deviceMarker}
        />
        <BreakdownCard
          id="tracker-languages"
          title="Languages"
          subtitle="The browser's language"
          slices={languageBreakdown(events)}
          emptyText="The language of each browser that opens a gift shows here."
        />
      </div>

      {letters.length > 0 && (
        <section aria-labelledby="tracker-gifts" className="mt-10 md:mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="tracker-gifts" className="font-display text-[28px] leading-tight">
              Your gifts
            </h2>
            <p className="text-sm text-night-lilac">
              {letters.length === 1 ? "1 gift" : `${formatCount(letters.length)} gifts`}, {formatCount(totals.giftsOpened)} opened
            </p>
          </div>
          <ul className="mt-4 grid items-start gap-3 sm:gap-4 lg:grid-cols-2">
            {letters.map((letter) => (
              <li key={letter.id}>
                <TrackedGift
                  gift={giftInfo(letter, now)}
                  events={byLetter.get(letter.id) ?? []}
                  now={nowIso}
                  icon={giftIcon(letter)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// Before the first open: send a first gift, or wait for the one already sent.
function Invitation({ sent }: { sent: number }) {
  return (
    <div className={`${cardSurface} mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6 md:mt-8`}>
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <MoonPhase lit={sent ? 0.25 : 0} size={32} className={`mt-1 flex-none ${sent ? "text-night-rose" : "text-night-lilac"}`} />
        <div className="min-w-0">
          <h2 className="font-display text-[22px] leading-snug">{sent ? "Waiting for the first open" : "Send your first gift"}</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-night-lilac">
          {sent
            ? "You'll see each open here the moment it happens: when, roughly where, in which language and on which device. Not sent the link yet? It is on My gifts."
            : "Once a gift is opened, this page shows when, roughly where, in which language and on which device."}
          </p>
        </div>
      </div>
      {sent ? (
        <Link href="/dashboard/gifts" className={`ml-12 flex-none sm:ml-0 ${secondaryButton}`}>
          My gifts
        </Link>
      ) : (
        <Link href="/dashboard/find" className={`ml-12 flex-none sm:ml-0 ${primaryButton}`}>
          Find a gift <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}

function giftInfo(letter: LetterSummary, now: Date): TrackedGiftInfo {
  const template = letter.templateId ? getTemplate(letter.templateId) : undefined
  return {
    id: letter.id,
    kind: letter.kind,
    name: letter.recipientName ? `For ${displayName(letter.recipientName)}` : letter.title ?? "A gift in progress",
    // The date never breaks across lines ("21 Nov"); the line may break after the design.
    eyebrow: `${template?.name ?? "No design yet"} · ${shortDate(letter.createdAt, now).replaceAll(" ", "\u00a0")}`,
    hasContent: letter.hasContent,
    stats: letter.stats,
  }
}

function giftIcon(letter: LetterSummary) {
  if (letter.templateId) return <TemplateIcon id={letter.templateId} className="h-[18px] w-[18px]" />
  const Fallback = letter.kind === "calendar" ? CalendarDays : Mail
  return <Fallback className="h-[18px] w-[18px]" aria-hidden="true" />
}

const markerIcon = "h-4 w-4 flex-none text-night-lilac"

// The flag is data, not decoration (docs/brand.md), and hidden from screen
// readers, which read the country's name.
function countryMarker(slice: Slice) {
  const flag = slice.kind === "value" ? countryFlag(slice.key) : ""
  if (!flag) return <Globe2 className={markerIcon} aria-hidden="true" />
  return (
    <span aria-hidden="true" className="w-4 flex-none text-center text-base leading-none">
      {flag}
    </span>
  )
}

const DEVICE_ICONS = { phone: Smartphone, tablet: Tablet, desktop: Monitor } as const

function deviceMarker(slice: Slice) {
  const Icon = DEVICE_ICONS[slice.key as keyof typeof DEVICE_ICONS] ?? CircleHelp
  return <Icon className={markerIcon} aria-hidden="true" />
}
