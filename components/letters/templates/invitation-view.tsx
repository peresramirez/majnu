"use client"

// wedding-invite and party-invite: one invitation with two moods.
// Elegant: an engraved card with a monogram, a double rule and quiet type.
// Playful: big type, a ticket with a tear-off stub, chunky countdown tiles.
// Both show the date and time as written by the sender (the event's own local
// time), a link to Google Maps, an .ics file made in the browser, and a live
// countdown. An invitation with a gift list shows it at the end (issue #35).
//
// This is the client half; ./invitation.tsx renders it on the server with the
// gift list's claimed ids.
import { useEffect, useMemo, useState, type CSSProperties } from "react"
import type { LetterContent } from "@/lib/letters/schema"
import { displayStyle, focusRing, MadeWith, Ornament, paperStyle, Stars } from "../chrome"
import {
  buildIcs,
  countdownTo,
  eventDateParts,
  formatEventDate,
  formatEventTime,
  icsFileName,
  mapsUrl,
  parseEventStart,
  type Countdown,
  type EventStart,
} from "../event-time"
import { GiftList } from "../gift-card"
import { useLetter, useMounted } from "../letter-context"
import { Wishlist } from "../wishlist"
import { Paragraphs, SignOff } from "../letter-text"
import { monogram, wholeName } from "../names"
import { paletteOf } from "../theme"

type Mood = "elegant" | "playful"

function useCountdown(start: EventStart | null): Countdown | null {
  const mounted = useMounted()
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    if (!mounted || !start) return
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [mounted, start])
  if (!start || !now) return null
  return countdownTo(start.instant, now)
}

function downloadIcs(content: LetterContent, start: EventStart, slug: string) {
  const event = content.event!
  const ics = buildIcs({
    uid: `${slug || "invitation"}-${start.instant.getTime()}@majnu.app`,
    title: event.title,
    start: start.instant,
    location: [event.locationName, event.address].filter(Boolean).join(", "),
    description: `Invitation from ${content.senderName}`,
    url: typeof window !== "undefined" ? window.location.href : undefined,
  })
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" })
  const href = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = href
  a.download = icsFileName(event.title)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}

const PinIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]">
    <path d="M10 18s6-5.4 6-10a6 6 0 1 0-12 0c0 4.6 6 10 6 10Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="10" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)
const CalendarIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]">
    <rect x="3" y="4.5" width="14" height="12.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M3 8.5h14M7 2.5v4M13 2.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

function Actions({ content, start, mood }: { content: LetterContent; start: EventStart | null; mood: Mood }) {
  const { slug } = useLetter()
  const event = content.event
  if (!event) return null
  const base =
    mood === "elegant"
      ? "flex flex-1 items-center justify-center gap-2 rounded-full border px-5 py-3.5 text-[14px] font-medium uppercase tracking-[0.16em] transition-colors duration-200"
      : "flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-4 text-[16px] font-semibold transition-transform duration-200 ease-calm hover:-translate-y-0.5"
  const primary: CSSProperties =
    mood === "elegant"
      ? { borderColor: "color-mix(in srgb, var(--page-ink) 40%, transparent)", color: "var(--page-ink)" }
      : { background: "var(--accent)", color: "var(--accent-ink)" }
  const secondary: CSSProperties =
    mood === "elegant"
      ? primary
      : { background: "var(--page-ink)", color: "var(--page-flat)" }
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <a href={mapsUrl(event.locationName, event.address)} target="_blank" rel="noopener noreferrer" className={`${base} ${focusRing}`} style={primary}>
        <PinIcon />
        Open in Maps
      </a>
      {start ? (
        <button type="button" onClick={() => downloadIcs(content, start, slug)} className={`${base} ${focusRing}`} style={secondary}>
          <CalendarIcon />
          Add to calendar
        </button>
      ) : null}
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, "0")

function CountdownView({ countdown, start, mood }: { countdown: Countdown | null; start: EventStart | null; mood: Mood }) {
  if (!start) return null
  const units = countdown
    ? [
        { n: String(countdown.days), label: countdown.days === 1 ? "day" : "days" },
        { n: pad(countdown.hours), label: "hours" },
        { n: pad(countdown.minutes), label: "min" },
        { n: pad(countdown.seconds), label: "sec" },
      ]
    : null
  const happening = countdown?.past

  if (mood === "elegant") {
    return (
      <div className="mt-10 text-center" aria-live="off">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--page-muted)]">{happening ? "The day is here" : "Counting down"}</p>
        <div className="mt-3 flex min-h-[56px] items-end justify-center gap-5 sm:gap-8">
          {happening ? null : units ? (
            units.map((u) => (
              <div key={u.label} className="min-w-[48px]">
                <p className="text-[34px] leading-none tabular-nums" style={{ fontFamily: "var(--formal)" }}>
                  {u.n}
                </p>
                <p className="mt-1.5 text-[10px] uppercase tracking-[0.24em] text-[var(--page-muted)]">{u.label}</p>
              </div>
            ))
          ) : (
            <span className="h-[56px]" />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-10" aria-live="off">
      <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[var(--page-muted)]">{happening ? "It's happening" : "Starts in"}</p>
      {happening ? null : (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {(units ?? [{ n: "–", label: "days" }, { n: "–", label: "hours" }, { n: "–", label: "min" }, { n: "–", label: "sec" }]).map((u, i) => (
            <div
              key={u.label}
              className="rounded-2xl px-2 py-3 text-center"
              style={{
                background: i === 0 ? "var(--accent)" : "var(--paper)",
                color: i === 0 ? "var(--accent-ink)" : "var(--paper-ink)",
                boxShadow: "0 10px 24px -16px rgba(0,0,0,0.45)",
              }}
            >
              <p className="text-[30px] font-bold leading-none tabular-nums" style={{ fontFamily: "var(--display)" }}>
                {u.n}
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">{u.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type ViewProps = { content: LetterContent; start: EventStart | null; countdown: Countdown | null; claimed?: string[] }

function GiftListSection({ content, claimed, mood }: { content: LetterContent; claimed?: string[]; mood: Mood }) {
  if (!content.wishlist?.length) return null
  return <Wishlist items={content.wishlist} claimed={claimed} mood={mood} hostName={content.senderName} />
}

function Elegant({ content, start, countdown, claimed }: ViewProps) {
  const event = content.event
  const dark = paletteOf(content.theme).dark
  const formal: CSSProperties = { fontFamily: "var(--formal)", fontWeight: 500 }
  return (
    <main className="relative min-h-[100svh] overflow-hidden" style={{ background: "var(--page)", color: "var(--page-ink)" }}>
      {dark ? <Stars className="opacity-60" /> : null}
      {/* Centred when it is shorter than the screen (an invitation without an event). */}
      <div className="relative mx-auto flex min-h-[100svh] max-w-[520px] flex-col justify-center px-4 pb-12 pt-10 sm:pt-16">
        <p className="rise text-center text-[12px] font-semibold uppercase tracking-[0.3em] text-[var(--page-muted)]">
          For {wholeName(content.recipientName)}
        </p>

        <article
          className="invite-card relative mt-6 rounded-[4px] px-7 pb-12 pt-12 text-center sm:px-12"
          style={{ ...paperStyle, boxShadow: "0 40px 80px -40px rgba(0,0,0,0.7), 0 10px 24px -14px rgba(0,0,0,0.4)" }}
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-[10px] rounded-[2px] border border-[var(--line)]" />
          <span aria-hidden="true" className="pointer-events-none absolute inset-[15px] rounded-[1px] border border-[var(--line)] opacity-70" />

          <div className="rise mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-full border text-[var(--paper-accent)]" style={{ borderColor: "color-mix(in srgb, var(--paper-accent) 45%, transparent)" }}>
            <span className="text-[26px] leading-none" style={formal}>
              {monogram(content.senderName)}
            </span>
          </div>

          <p className="rise mt-8 text-[11px] font-semibold uppercase tracking-[0.34em] text-[var(--paper-muted)]" style={{ animationDelay: "80ms" }}>
            {content.occasion}
          </p>
          <h1 className="rise mx-auto mt-4 max-w-[14ch] text-balance text-[42px] leading-[1.04] sm:text-[52px]" style={{ ...formal, animationDelay: "160ms" }}>
            {content.headline}
          </h1>

          <Paragraphs body={content.body} className="rise mx-auto mt-6 max-w-[34ch] text-[var(--paper-ink)]" style={{ animationDelay: "240ms" }} />

          {event && start ? (
            <div className="rise mt-9" style={{ animationDelay: "320ms" }}>
              <Ornament className="text-[var(--paper-accent)]" />
              <p className="mt-7 text-[12px] font-semibold uppercase tracking-[0.3em] text-[var(--paper-muted)]">{eventDateParts(start).weekday}</p>
              <p className="mt-2 text-[30px] leading-tight" style={formal}>
                {eventDateParts(start).day} {eventDateParts(start).month} {eventDateParts(start).year}
              </p>
              <p className="mt-1 text-[17px] text-[var(--paper-muted)]">at {formatEventTime(start)}</p>
              <p className="mt-7 text-[24px] leading-tight" style={formal}>
                {event.locationName}
              </p>
              <p className="mx-auto mt-1 max-w-[30ch] text-[15px] leading-relaxed text-[var(--paper-muted)]">{event.address}</p>
              <Ornament className="mt-8 text-[var(--paper-accent)]" />
            </div>
          ) : (
            // No date or place: the rule still closes the message before the names.
            <Ornament className="rise mt-9 text-[var(--paper-accent)]" style={{ animationDelay: "320ms" }} />
          )}

          <SignOff signOff={content.signOff} senderName={content.senderName} align="center" className="rise mt-9" />
        </article>

        <Actions content={content} start={start} mood="elegant" />
        <CountdownView countdown={countdown} start={start} mood="elegant" />
        <GiftList gifts={content.gifts} />
        <GiftListSection content={content} claimed={claimed} mood="elegant" />
        <MadeWith />
      </div>
    </main>
  )
}

// Static confetti: circles, squiggles and triangles in the palette, kept to the
// edges of the page so they never sit under the words. No motion.
function Confetti() {
  const shapes = [
    { x: -3, y: 3, r: 14, k: "ring" },
    { x: 50, y: 0.5, r: 8, k: "dot" },
    { x: 93, y: 13, r: 10, k: "tri" },
    { x: -4, y: 24, r: 12, k: "squig" },
    { x: 95, y: 36, r: 9, k: "dot" },
    { x: -3, y: 50, r: 10, k: "tri" },
    { x: 94, y: 62, r: 14, k: "squig" },
    { x: -4, y: 78, r: 15, k: "ring" },
    { x: 93, y: 92, r: 11, k: "dot" },
  ]
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {shapes.map((s, i) => (
        <svg
          key={i}
          viewBox="0 0 40 40"
          className="absolute opacity-80"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.r * 2.2, height: s.r * 2.2, transform: `rotate(${i * 37}deg)` }}
        >
          {s.k === "dot" ? <circle cx="20" cy="20" r="14" style={{ fill: i % 2 ? "var(--accent)" : "var(--accent-soft)" }} /> : null}
          {s.k === "ring" ? <circle cx="20" cy="20" r="13" fill="none" strokeWidth="5" style={{ stroke: "var(--accent-soft)" }} /> : null}
          {s.k === "tri" ? <path d="M20 5 L36 33 L4 33 Z" style={{ fill: "var(--accent)" }} opacity="0.85" /> : null}
          {s.k === "squig" ? (
            <path d="M3 24 C 9 10, 15 10, 20 22 S 31 34, 37 18" fill="none" strokeWidth="5" strokeLinecap="round" style={{ stroke: i % 2 ? "var(--accent)" : "var(--page-ink)" }} opacity="0.8" />
          ) : null}
        </svg>
      ))}
    </div>
  )
}

function Playful({ content, start, countdown, claimed }: ViewProps) {
  const event = content.event
  const parts = start ? eventDateParts(start) : null
  const display: CSSProperties = { fontFamily: "var(--display)", fontWeight: 700 }
  return (
    <main className="relative min-h-[100svh] overflow-hidden" style={{ background: "var(--page)", color: "var(--page-ink)" }}>
      <Confetti />
      {/* Centred when it is shorter than the screen (an invitation without an event). */}
      <div className="relative mx-auto flex min-h-[100svh] max-w-[520px] flex-col justify-center px-4 pb-12 pt-10 sm:pt-16">
        <div className="pop flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[var(--page-muted)]">Hey {wholeName(content.recipientName)}</p>
          <span
            className="rotate-[6deg] rounded-full px-4 py-2 text-[13px] font-bold uppercase tracking-[0.14em] shadow-[0_8px_18px_-10px_rgba(0,0,0,0.5)]"
            style={{ background: "var(--page-ink)", color: "var(--page-flat)" }}
          >
            {content.occasion || "You're invited"}
          </span>
        </div>

        <h1 className="pop mt-8 text-balance text-[56px] leading-[0.95] tracking-[-0.03em] sm:text-[76px]" style={{ ...display, animationDelay: "80ms" }}>
          {content.headline}
        </h1>

        <Paragraphs body={content.body} className="pop mt-6 max-w-[36ch]" style={{ animationDelay: "160ms" }} />

        {event && parts && start ? (
          <div className="pop mt-9 flex overflow-hidden rounded-[22px] shadow-[0_24px_50px_-28px_rgba(0,0,0,0.6)]" style={{ animationDelay: "240ms" }}>
            <div className="ticket-main flex-1 p-5" style={paperStyle}>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--paper-muted)]">When</p>
              <p className="mt-1 text-[20px] leading-tight" style={display}>
                {formatEventDate(start)}
              </p>
              <p className="text-[17px] font-semibold">{formatEventTime(start)}</p>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--paper-muted)]">Where</p>
              <p className="mt-1 text-[20px] leading-tight" style={display}>
                {event.locationName}
              </p>
              <p className="mt-0.5 text-[14px] leading-snug text-[var(--paper-muted)]">{event.address}</p>
            </div>
            <div className="ticket-stub relative flex w-[92px] shrink-0 flex-col items-center justify-center" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
              <span className="text-[13px] font-bold uppercase tracking-[0.18em]">{parts.weekdayShort}</span>
              <span className="my-0.5 text-[46px] leading-none" style={display}>
                {parts.day}
              </span>
              <span className="text-[13px] font-bold uppercase tracking-[0.18em]">{parts.monthShort}</span>
            </div>
          </div>
        ) : null}

        <CountdownView countdown={countdown} start={start} mood="playful" />
        <Actions content={content} start={start} mood="playful" />

        <SignOff signOff={content.signOff} senderName={content.senderName} className="pop mt-12" />
        <GiftList gifts={content.gifts} />
        <GiftListSection content={content} claimed={claimed} mood="playful" />
        <MadeWith />
      </div>
      <style>{`
        .ticket-stub::before { content: ""; position: absolute; left: -1px; top: 10px; bottom: 10px; border-left: 3px dotted var(--paper); opacity: 0.9; }
        .ticket-main { -webkit-mask: radial-gradient(circle 11px at 100% 0, transparent 98%, #000) top / 100% 51% no-repeat, radial-gradient(circle 11px at 100% 100%, transparent 98%, #000) bottom / 100% 51% no-repeat;
                       mask: radial-gradient(circle 11px at 100% 0, transparent 98%, #000) top / 100% 51% no-repeat, radial-gradient(circle 11px at 100% 100%, transparent 98%, #000) bottom / 100% 51% no-repeat; }
        .ticket-stub { -webkit-mask: radial-gradient(circle 11px at 0 0, transparent 98%, #000) top / 100% 51% no-repeat, radial-gradient(circle 11px at 0 100%, transparent 98%, #000) bottom / 100% 51% no-repeat;
                       mask: radial-gradient(circle 11px at 0 0, transparent 98%, #000) top / 100% 51% no-repeat, radial-gradient(circle 11px at 0 100%, transparent 98%, #000) bottom / 100% 51% no-repeat; }
      `}</style>
    </main>
  )
}

// `claimed`: the gift list's claimed item ids, read on the server. Undefined
// when the server did not read them; the gift list then asks after loading.
export function InvitationView({ content, mood, claimed }: { content: LetterContent; mood: Mood; claimed?: string[] }) {
  const start = useMemo(() => parseEventStart(content.event?.startsAt), [content.event?.startsAt])
  const countdown = useCountdown(start)
  return (
    <>
      {mood === "elegant" ? (
        <Elegant content={content} start={start} countdown={countdown} claimed={claimed} />
      ) : (
        <Playful content={content} start={start} countdown={countdown} claimed={claimed} />
      )}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .rise { animation: rise 900ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
          .invite-card { animation: card-rise 1100ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
          .pop { animation: pop 700ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
        }
        @keyframes rise { from { opacity: 0; transform: translateY(12px); } }
        @keyframes card-rise { from { opacity: 0; transform: translateY(36px) rotate(-1deg); } }
        @keyframes pop { from { opacity: 0; transform: translateY(18px) scale(0.98); } }
      `}</style>
    </>
  )
}
