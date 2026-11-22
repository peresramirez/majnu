"use client"

// "Open in Maps" and "Add to calendar" for the 3D invitations, as the wedding
// envelope has them. The calendar file is made in the browser from the
// invitation; nothing is fetched.
import type { CSSProperties } from "react"
import type { LetterContent } from "@/lib/letters/schema"
import { focusRing } from "../../chrome"
import { buildIcs, icsFileName, mapsUrl, type EventStart } from "../../event-time"

export function downloadIcs(content: LetterContent, start: EventStart, slug: string) {
  const event = content.event!
  const ics = buildIcs({
    uid: `${slug || "invitation"}-${start.instant.getTime()}@majnu.app`,
    title: event.title,
    start: start.instant,
    location: [event.locationName, event.address].filter(Boolean).join(", "),
    description: `Invitation from ${content.senderName}`,
    url: window.location.href,
  })
  const href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = href
  a.download = icsFileName(event.title)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}

export function EventActions({
  content,
  start,
  slug,
  className = "",
  actionClass,
  actionStyle,
}: {
  content: LetterContent
  start: EventStart | null
  slug: string
  className?: string
  actionClass: string
  actionStyle?: CSSProperties
}) {
  const event = content.event
  if (!event) return null
  return (
    <div className={`flex flex-col gap-3 sm:flex-row ${className}`}>
      <a href={mapsUrl(event.locationName, event.address)} target="_blank" rel="noopener noreferrer" className={`${actionClass} ${focusRing}`} style={actionStyle}>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]">
          <path d="M10 18s6-5.4 6-10a6 6 0 1 0-12 0c0 4.6 6 10 6 10Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="10" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        Open in Maps
        <span className="sr-only">(opens in a new tab)</span>
      </a>
      {start ? (
        <button type="button" onClick={() => downloadIcs(content, start, slug)} className={`${actionClass} ${focusRing}`} style={actionStyle}>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]">
            <rect x="3" y="4.5" width="14" height="12.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3 8.5h14M7 2.5v4M13 2.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Add to calendar
        </button>
      ) : null}
    </div>
  )
}
