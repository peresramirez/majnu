"use client"

import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import type { LetterKind } from "@/lib/letters/schema"
import { plural, timeAgo } from "../format"
import { eyebrow, focusRing } from "../styles"
import { giftNumbers } from "./analytics"
import { cardSurface, formatCount } from "./card"
import {
  countryFlag,
  deviceName,
  eventTitle,
  groupByDay,
  languageName,
  placeName,
  shortDateTime,
  timeOfDay,
  trackerStatus,
  type TrackedEvent,
  type TrackerLetter,
} from "./timeline"
import { useViewerTimeZone } from "./use-time-zone"

export type TrackedGiftInfo = TrackerLetter & {
  id: string
  kind: LetterKind
  name: string
  // "Classic envelope · 21 Nov", formatted on the server.
  eyebrow: string
}

// The newest lines shown per gift. The counts in the status line cover all of them.
const MAX_LINES = 100

// One gift in the Tracker's list (issues #49 and #75): whether it was opened,
// how often and by how many people, when first and last, and behind "Show
// timeline" every open, door and gift tap with the time in the viewer's
// timezone, the place, the language and the device. A native <details>, so it
// opens with the keyboard and without JavaScript.
export function TrackedGift({ gift, events, now, icon }: { gift: TrackedGiftInfo; events: TrackedEvent[]; now: string; icon: ReactNode }) {
  const timeZone = useViewerTimeZone() ?? "UTC"
  const nowDate = new Date(now)
  const status = trackerStatus(gift, events, nowDate)
  const numbers = giftNumbers(gift, events)
  const shown = events.slice(0, MAX_LINES)
  const days = groupByDay(shown, timeZone, nowDate)

  return (
    <article className={cardSurface}>
      <div className="flex items-start gap-3.5">
        <span
          className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-night-plum text-night-rose ring-1 ring-inset ring-night-petal/10"
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[22px] leading-snug text-night-petal [overflow-wrap:anywhere]">{gift.name}</h3>
          <p className="mt-0.5 text-sm text-night-lilac">{gift.eyebrow}</p>
        </div>
        <StatusChip state={status.state} />
      </div>

      {status.state === "opened" ? (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-[auto_auto_1fr_1fr] sm:gap-x-7">
            <Figure label="Opens" value={formatCount(numbers.opens)} />
            <Figure label="People" value={formatCount(numbers.visitors)} />
            {numbers.firstOpenedAt && (
              <Figure label="First opened" value={<time dateTime={numbers.firstOpenedAt}>{shortDateTime(numbers.firstOpenedAt, timeZone, nowDate)}</time>} small />
            )}
            {numbers.lastOpenedAt && (
              <LastOpened at={numbers.lastOpenedAt} timeZone={timeZone} now={nowDate} />
            )}
          </dl>
          {numbers.taps > 0 && (
            <p className="mt-4 text-sm text-night-lilac">
              The gift was tapped {numbers.taps === 1 ? "once" : numbers.taps === 2 ? "twice" : plural(numbers.taps, "time", "times")}.
            </p>
          )}
        </>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-night-lilac">{status.detail}</p>
      )}

      {events.length > 0 && (
        <details className="group mt-5 border-t border-night-petal/10 pt-3">
          <summary
            className={`-mx-2 flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-2 py-2 text-[15px] font-semibold text-night-petal hover:bg-night-petal/5 [&::-webkit-details-marker]:hidden ${focusRing}`}
          >
            <span>
              <span className="group-open:hidden">Show timeline</span>
              <span className="hidden group-open:inline">Hide timeline</span>
              <span className="font-normal text-night-lilac"> · {events.length === 1 ? "1 entry" : `${formatCount(events.length)} entries`}</span>
            </span>
            <ChevronDown
              className="h-5 w-5 flex-none text-night-lilac transition-none group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-calm"
              aria-hidden="true"
            />
          </summary>

          <ol className="mt-3 space-y-5">
            {days.map((day) => (
              <li key={day.key}>
                <h4 className={eyebrow}>{day.label}</h4>
                <ol className="mt-2 border-l border-night-petal/15">
                  {day.events.map((event) => (
                    <TimelineLine key={event.id} event={event} kind={gift.kind} timeZone={timeZone} />
                  ))}
                </ol>
              </li>
            ))}
          </ol>
          {events.length > shown.length && (
            <p className="mt-4 text-sm text-night-lilac">Showing the latest {shown.length} of {formatCount(events.length)}.</p>
          )}
        </details>
      )}
    </article>
  )
}

const CHIPS = {
  opened: { label: "Opened", className: "bg-night-rose/15 text-night-petal", dot: "bg-night-rose" },
  waiting: { label: "Not opened", className: "text-night-lilac ring-1 ring-inset ring-night-petal/15", dot: "ring-1 ring-inset ring-night-lilac/70" },
  draft: { label: "Draft", className: "text-night-lilac ring-1 ring-inset ring-night-petal/10", dot: "bg-night-lilac/40" },
} as const

function StatusChip({ state }: { state: keyof typeof CHIPS }) {
  const chip = CHIPS[state]
  return (
    <span className={`mt-1 inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${chip.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${chip.dot}`} aria-hidden="true" />
      {chip.label}
    </span>
  )
}

// "3 hours ago" over "Today, 05:49". When the relative time is a single word
// ("yesterday"), the date and time alone say it without repeating it.
function LastOpened({ at, timeZone, now }: { at: string; timeZone: string; now: Date }) {
  const ago = timeAgo(at, now)
  const exact = shortDateTime(at, timeZone, now)
  const repeats = /^(today|yesterday)$/.test(ago)
  return (
    <Figure label="Last opened" value={<time dateTime={at}>{repeats ? exact : ago}</time>} hint={repeats ? undefined : exact} small />
  )
}

function Figure({ label, value, hint, small = false }: { label: string; value: ReactNode; hint?: string; small?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-night-lilac">{label}</dt>
      <dd className={`mt-1 text-night-petal ${small ? "text-[15px] font-medium leading-snug" : "text-2xl font-semibold leading-none"}`}>{value}</dd>
      {hint && <dd className="mt-0.5 text-xs text-night-lilac">{hint}</dd>}
    </div>
  )
}

function TimelineLine({ event, kind, timeZone }: { event: TrackedEvent; kind: LetterKind; timeZone: string }) {
  const place = placeName(event.country, event.city)
  const flag = countryFlag(event.country)
  const details = [languageName(event.language), deviceName(event.device)].filter(Boolean)

  return (
    <li className="relative py-2 pl-5">
      <span
        className={`absolute -left-[5px] top-[15px] h-2.5 w-2.5 rounded-full ${event.type === "open" ? "bg-night-rose" : "bg-night-velvet ring-2 ring-inset ring-night-lilac/70"}`}
        aria-hidden="true"
      />
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <time dateTime={event.at} className="text-sm tabular-nums text-night-lilac">
          {timeOfDay(event.at, timeZone)}
        </time>
        <span className="text-[15px] font-medium text-night-petal">{eventTitle(event, kind)}</span>
      </p>
      <p className="mt-0.5 text-sm leading-relaxed text-night-lilac">
        {place || details.length ? (
          <>
            {place && (
              <>
                {flag && (
                  <span aria-hidden="true" className="mr-1.5">
                    {flag}
                  </span>
                )}
                {place}
              </>
            )}
            {place && details.length ? " · " : null}
            {details.join(" · ")}
          </>
        ) : (
          "Place and device not recorded"
        )}
      </p>
    </li>
  )
}
