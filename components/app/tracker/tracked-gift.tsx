"use client"

import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import type { LetterKind } from "@/lib/letters/schema"
import { eyebrow, focusRing } from "../styles"
import {
  countryFlag,
  deviceName,
  eventTitle,
  groupByDay,
  languageName,
  placeName,
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

// One gift on the Tracker tab: its status, and behind "Show timeline" every
// open, door and gift tap with the time in the viewer's timezone, the place,
// the language and the device. A native <details>, so it opens with the
// keyboard and without JavaScript.
export function TrackedGift({ gift, events, now, icon }: { gift: TrackedGiftInfo; events: TrackedEvent[]; now: string; icon: ReactNode }) {
  const timeZone = useViewerTimeZone() ?? "UTC"
  const nowDate = new Date(now)
  const status = trackerStatus(gift, events, nowDate)
  const shown = events.slice(0, MAX_LINES)
  const days = groupByDay(shown, timeZone, nowDate)

  return (
    <article className="rounded-3xl bg-night-velvet p-5 ring-1 ring-inset ring-night-petal/10 sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="text-night-rose">{icon}</span>
        <p className={`truncate ${eyebrow}`}>{gift.eyebrow}</p>
      </div>

      <h2 className="mt-4 font-display text-2xl leading-snug text-night-petal">{gift.name}</h2>

      <div className="mt-3">
        <p className={`flex items-center gap-2 text-[15px] ${status.state === "opened" ? "font-medium text-night-petal" : "text-night-lilac"}`}>
          <span
            className={`h-2 w-2 flex-none rounded-full ${status.state === "opened" ? "bg-night-rose" : "ring-1 ring-inset ring-night-lilac/60"}`}
            aria-hidden="true"
          />
          {status.headline}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-night-lilac">{status.detail}</p>
      </div>

      {events.length > 0 && (
        <details className="group mt-5 border-t border-night-petal/10 pt-4">
          <summary
            className={`-mx-2 flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-2 py-2 text-[15px] font-semibold text-night-petal hover:bg-night-petal/5 [&::-webkit-details-marker]:hidden ${focusRing}`}
          >
            <span>
              <span className="group-open:hidden">Show timeline</span>
              <span className="hidden group-open:inline">Hide timeline</span>
              <span className="font-normal text-night-lilac"> · {events.length === 1 ? "1 entry" : `${events.length} entries`}</span>
            </span>
            <ChevronDown
              className="h-5 w-5 flex-none text-night-lilac transition-none group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-calm"
              aria-hidden="true"
            />
          </summary>

          <ol className="mt-3 space-y-5">
            {days.map((day) => (
              <li key={day.key}>
                <h3 className={eyebrow}>{day.label}</h3>
                <ol className="mt-2 border-l border-night-petal/15">
                  {day.events.map((event) => (
                    <TimelineLine key={event.id} event={event} kind={gift.kind} timeZone={timeZone} />
                  ))}
                </ol>
              </li>
            ))}
          </ol>
          {events.length > shown.length && (
            <p className="mt-4 text-sm text-night-lilac">Showing the latest {shown.length} of {events.length}.</p>
          )}
        </details>
      )}
    </article>
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
