// <TemplateCard id />: a template as a card, for the chat's template picker and
// the landing page. Part of the contract (docs/plan.md, "Who builds what").
//
// The thumbnail is a small, still drawing of the template's first screen, made
// from its fixture (lib/letters/fixtures.ts) in the template's own palette and
// type: the sealed envelope, the wrapped box, the engraved card, and so on. It
// is not the template itself, so it has no hooks, no state, no animation and
// no tracking, and it ships no JavaScript when rendered on the server. Sizes
// are in container units (cqw), so the drawing scales with the card's width.
//
// Everything is a <span> or an <svg>, so the card can sit inside a <button> or
// a link. Unknown ids render nothing.
import type { CSSProperties, ReactNode } from "react"
import { letterFontVariables } from "@/app/fonts"
import { MoonPhase } from "@/components/brand/moon-phase"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import type { CalendarContent, LetterContent, TemplateId } from "@/lib/letters/schema"
import { getTemplate } from "@/lib/letters/templates"
import { displayStyle, paperStyle } from "./chrome"
import { BoxDrawing } from "./templates/gift-box-3d/drawing"
import { Compass, ink, parchment } from "./templates/treasure-map/parts"
import { EnvelopeDrawing } from "./templates/wedding-envelope-3d/drawing"
import { eventDateParts, formatEventTime, parseEventStart } from "./event-time"
import { firstName, monogram } from "./names"
import { paletteOf, themeStyle } from "./theme"

const cq = (n: number) => `${n}cqw`

const eyebrow: CSSProperties = {
  fontSize: cq(2.9),
  fontWeight: 600,
  letterSpacing: "0.26em",
  textTransform: "uppercase",
  color: "var(--page-muted)",
}

// Lining figures: the serif's old-style 1 reads as an I at this size.
const lining: CSSProperties = { fontVariantNumeric: "lining-nums" }

const STARS = [
  [8, 6, 0.5], [22, 14, 0.35], [37, 4, 0.35], [63, 9, 0.5], [81, 5, 0.35], [92, 16, 0.5],
  [6, 34, 0.35], [94, 44, 0.35], [10, 88, 0.5], [88, 92, 0.35], [52, 96, 0.35],
] as const

function Sky() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {STARS.map(([x, y, r], i) => (
        <span
          key={i}
          className="absolute rounded-full bg-[var(--page-ink)]"
          style={{ left: `${x}%`, top: `${y}%`, width: cq(r * 2), height: cq(r * 2), opacity: 0.2 + (i % 3) * 0.12 }}
        />
      ))}
    </span>
  )
}

// ---------- One drawing per template ----------

function EnvelopeThumb({ c }: { c: LetterContent }) {
  const initial = Array.from((c.senderName ?? "").trim())[0]?.toUpperCase() ?? "M"
  return (
    <span className="flex h-full flex-col items-center justify-center">
      <span style={eyebrow}>{c.occasion || "A letter"}</span>
      <span className="relative mt-[7cqw] block w-[80cqw]" style={{ aspectRatio: "1.5" }}>
        <span className="absolute inset-0 rounded-[1cqw]" style={{ background: "var(--wrap-shade)" }} />
        <span
          className="absolute inset-0 rounded-[1cqw]"
          style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--wrap) 92%, #fff) 0%, var(--wrap) 60%)", clipPath: "polygon(0 100%, 50% 43%, 100% 100%)" }}
        />
        <span
          className="absolute inset-x-0 top-0 h-[51%]"
          style={{ background: "linear-gradient(180deg, var(--wrap) 0%, color-mix(in srgb, var(--wrap) 86%, #000) 100%)", clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
        />
        <span
          className="absolute left-1/2 top-[48%] flex h-[15cqw] w-[15cqw] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
          style={{
            background: "radial-gradient(circle at 36% 30%, color-mix(in srgb, var(--accent) 70%, #fff) 0%, var(--accent) 45%, color-mix(in srgb, var(--accent) 62%, #000) 100%)",
            boxShadow: "0 1cqw 2cqw rgba(0,0,0,0.35)",
          }}
        >
          <span style={{ ...displayStyle, fontSize: cq(6), lineHeight: 1, color: "color-mix(in srgb, var(--accent) 55%, #000)" }}>{initial}</span>
        </span>
        <span className="absolute inset-x-0 bottom-[7%] block text-center text-[var(--wrap-ink)]">
          <span className="block opacity-70" style={{ fontSize: cq(2.4), fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase" }}>
            For
          </span>
          <span className="block" style={{ ...displayStyle, fontSize: cq(7), lineHeight: 1 }}>
            {firstName(c.recipientName)}
          </span>
        </span>
      </span>
      <span className="mt-[9cqw] text-[var(--page-muted)]" style={{ fontSize: cq(3.2) }}>
        Tap the seal to open
      </span>
    </span>
  )
}

function GiftThumb({ c }: { c: LetterContent }) {
  const paper: CSSProperties = {
    backgroundColor: "var(--wrap)",
    backgroundImage: "repeating-linear-gradient(135deg, transparent 0 3cqw, color-mix(in srgb, var(--wrap-shade) 85%, transparent) 3cqw 6cqw)",
  }
  const ribbon: CSSProperties = {
    background: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 85%, #000), var(--accent) 35%, var(--accent) 65%, color-mix(in srgb, var(--accent) 85%, #000))",
  }
  return (
    <span className="flex h-full flex-col items-center justify-center">
      <span style={eyebrow}>{c.occasion || "A gift"}</span>
      <span className="mt-[2cqw]" style={{ ...displayStyle, fontSize: cq(8), lineHeight: 1.1 }}>
        For {firstName(c.recipientName)}
      </span>
      <span className="relative mt-[8cqw] block h-[46cqw] w-[54cqw]">
        {/* Box */}
        <span className="absolute bottom-0 left-[3cqw] right-[3cqw] h-[30cqw] overflow-hidden rounded-[1cqw]" style={paper}>
          <span className="absolute inset-y-0 left-1/2 w-[6cqw] -translate-x-1/2" style={ribbon} />
        </span>
        {/* Lid */}
        <span className="absolute bottom-[28.5cqw] left-0 right-0 h-[10cqw] rounded-[1cqw] shadow-[0_1cqw_2cqw_-1cqw_rgba(0,0,0,0.4)]" style={paper}>
          <span className="absolute inset-y-0 left-1/2 w-[6cqw] -translate-x-1/2" style={ribbon} />
        </span>
        {/* Bow */}
        <svg viewBox="0 0 120 60" className="absolute bottom-[36cqw] left-1/2 w-[30cqw] -translate-x-1/2 overflow-visible" aria-hidden="true">
          <path d="M60 50 C42 14 6 12 8 36 C10 56 42 58 60 50 Z" style={{ fill: "var(--accent)" }} />
          <path d="M60 50 C78 14 114 12 112 36 C110 56 78 58 60 50 Z" style={{ fill: "var(--accent)" }} />
          <ellipse cx="60" cy="50" rx="10" ry="9" style={{ fill: "color-mix(in srgb, var(--accent) 82%, #000)" }} />
        </svg>
      </span>
      <span
        className="mt-[8cqw] rounded-full px-[5cqw] py-[2.4cqw]"
        style={{ background: "var(--accent)", color: "var(--accent-ink)", fontSize: cq(3.4), fontWeight: 600 }}
      >
        Unwrap your gift
      </span>
    </span>
  )
}

function WeddingThumb({ c }: { c: LetterContent }) {
  const start = parseEventStart(c.event?.startsAt)
  const parts = start ? eventDateParts(start) : null
  const formal: CSSProperties = { fontFamily: "var(--formal)", fontWeight: 500 }
  return (
    <span className="flex h-full flex-col items-center justify-center">
      <span style={eyebrow}>For {firstName(c.recipientName)}</span>
      <span
        className="relative mt-[4cqw] flex w-[80cqw] flex-col items-center px-[6cqw] pb-[8cqw] pt-[8cqw] text-center"
        style={{ ...paperStyle, borderRadius: cq(0.8), boxShadow: "0 4cqw 8cqw -4cqw rgba(0,0,0,0.7)" }}
      >
        <span className="pointer-events-none absolute inset-[2cqw] border border-[var(--line)]" />
        <span className="pointer-events-none absolute inset-[3cqw] border border-[var(--line)] opacity-70" />
        <span
          className="flex h-[14cqw] w-[14cqw] items-center justify-center rounded-full border text-[var(--paper-accent)]"
          style={{ borderColor: "color-mix(in srgb, var(--paper-accent) 45%, transparent)", ...formal, fontSize: cq(4.6) }}
        >
          {monogram(c.senderName)}
        </span>
        <span className="mt-[4cqw] text-[var(--paper-muted)]" style={{ fontSize: cq(2.4), fontWeight: 600, letterSpacing: "0.32em", textTransform: "uppercase" }}>
          {c.occasion}
        </span>
        <span className="mt-[2.4cqw] text-balance" style={{ ...formal, fontSize: cq(8), lineHeight: 1.04 }}>
          {c.headline}
        </span>
        {parts && start ? (
          <>
            <span className="mt-[4cqw] flex items-center gap-[2cqw] text-[var(--paper-accent)]">
              <span className="h-px w-[8cqw] bg-current opacity-40" />
              <span className="h-[1.2cqw] w-[1.2cqw] rotate-45 bg-current opacity-70" />
              <span className="h-px w-[8cqw] bg-current opacity-40" />
            </span>
            <span className="mt-[3cqw]" style={{ ...formal, ...lining, fontSize: cq(5) }}>
              {parts.day} {parts.month} {parts.year}
            </span>
            <span className="text-[var(--paper-muted)]" style={{ fontSize: cq(3) }}>
              at {formatEventTime(start)}
            </span>
          </>
        ) : null}
      </span>
    </span>
  )
}

function PartyThumb({ c }: { c: LetterContent }) {
  const start = parseEventStart(c.event?.startsAt)
  const parts = start ? eventDateParts(start) : null
  const display: CSSProperties = { fontFamily: "var(--display)", fontWeight: 700 }
  const dots = [
    { x: -3, y: 4, s: 7, ring: true },
    { x: 52, y: 1, s: 4 },
    { x: 92, y: 30, s: 4.5 },
    { x: 95, y: 70, s: 6, ring: true },
    { x: -2, y: 62, s: 4 },
  ]
  return (
    <span className="relative flex h-full flex-col justify-center px-[7cqw]">
      {dots.map((d, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: cq(d.s),
            height: cq(d.s),
            ...(d.ring ? { border: `${cq(1.2)} solid var(--accent-soft)` } : { background: i % 2 ? "var(--accent)" : "var(--accent-soft)" }),
          }}
        />
      ))}
      <span className="flex items-center justify-between gap-[2cqw]">
        <span style={{ ...eyebrow, letterSpacing: "0.18em" }}>Hey {firstName(c.recipientName)}</span>
        <span
          className="rotate-[6deg] rounded-full px-[3cqw] py-[1.4cqw]"
          style={{ background: "var(--page-ink)", color: "var(--page-flat)", fontSize: cq(2.6), fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}
        >
          {c.occasion || "You're invited"}
        </span>
      </span>
      <span className="mt-[6cqw] text-balance" style={{ ...display, fontSize: cq(13), lineHeight: 0.95, letterSpacing: "-0.03em" }}>
        {c.headline}
      </span>
      {parts && start && c.event ? (
        <span className="mt-[7cqw] flex overflow-hidden rounded-[4cqw] shadow-[0_3cqw_6cqw_-3cqw_rgba(0,0,0,0.5)]">
          <span className="flex-1 p-[4cqw]" style={paperStyle}>
            <span className="block text-[var(--paper-muted)]" style={{ fontSize: cq(2.2), fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase" }}>
              When
            </span>
            <span className="block" style={{ ...display, fontSize: cq(4.2), lineHeight: 1.15 }}>
              {parts.weekday} {parts.day} {parts.month}
            </span>
            <span className="block" style={{ fontSize: cq(3.4), fontWeight: 600 }}>
              {formatEventTime(start)}
            </span>
            <span className="mt-[2cqw] block truncate" style={{ ...display, fontSize: cq(4.2) }}>
              {c.event.locationName}
            </span>
          </span>
          <span className="flex w-[18cqw] shrink-0 flex-col items-center justify-center" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
            <span style={{ fontSize: cq(2.6), fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>{parts.weekdayShort}</span>
            <span style={{ ...display, fontSize: cq(9), lineHeight: 1 }}>{parts.day}</span>
            <span style={{ fontSize: cq(2.6), fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>{parts.monthShort}</span>
          </span>
        </span>
      ) : null}
    </span>
  )
}

function PostcardThumb({ c }: { c: LetterContent }) {
  return (
    <span className="flex h-full flex-col items-center justify-center">
      <span style={eyebrow}>A postcard for {firstName(c.recipientName)}</span>
      <span
        className="relative mt-[5cqw] block w-[72cqw] -rotate-2 p-[2cqw]"
        style={{ aspectRatio: "3 / 4", background: "var(--paper)", borderRadius: cq(1), boxShadow: "0 5cqw 10cqw -5cqw rgba(0,0,0,0.55)" }}
      >
        <span
          className="relative block h-full w-full overflow-hidden"
          style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 28%, var(--paper)) 0%, var(--paper) 70%)" }}
        >
          <svg viewBox="0 0 300 200" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 h-[62%] w-full" aria-hidden="true">
            <circle cx="212" cy="78" r="34" style={{ fill: "var(--accent-soft)" }} />
            <path d="M0 132 C 50 104, 96 108, 150 126 S 250 112, 300 98 L300 200 L0 200 Z" style={{ fill: "var(--wrap)" }} />
            <path d="M0 152 C 60 132, 120 140, 170 154 S 260 142, 300 136 L300 200 L0 200 Z" style={{ fill: "var(--wrap-shade)" }} />
            <path d="M0 174 C 70 160, 140 168, 200 178 S 270 170, 300 166 L300 200 L0 200 Z" style={{ fill: "var(--paper-accent)" }} opacity="0.85" />
          </svg>
          <span className="relative block max-w-[11ch] p-[4.5cqw] text-[var(--paper-ink)]" style={{ ...displayStyle, fontSize: cq(9), lineHeight: 0.98 }}>
            {c.headline}
          </span>
        </span>
      </span>
    </span>
  )
}

// The 3D box as its still drawing: the same picture the gift page shows before
// three.js arrives, and instead of it with reduced motion.
function Box3DThumb({ c, mood }: { c: LetterContent; mood: "gift" | "party" }) {
  return (
    <span className="flex h-full flex-col items-center justify-center">
      <span style={eyebrow}>{c.occasion || (mood === "party" ? "Surprise" : "A gift")}</span>
      <span className="mt-[2cqw]" style={{ ...displayStyle, fontSize: cq(8), lineHeight: 1.1 }}>
        For {firstName(c.recipientName)}
      </span>
      <BoxDrawing mood={mood} idPrefix={`thumb-${mood}`} className="mt-[6cqw] block h-auto w-[72cqw]" />
      <span
        className="mt-[6cqw] rounded-full px-[5cqw] py-[2.4cqw]"
        style={{ background: "var(--accent)", color: "var(--accent-ink)", fontSize: cq(3.4), fontWeight: 600 }}
      >
        {mood === "party" ? "Pop it open" : "Open your gift"}
      </span>
    </span>
  )
}

// The 3D wedding envelope as its still drawing, sealed, as the invitation
// shows it before three.js arrives and instead of it with reduced motion.
function Envelope3DThumb({ c }: { c: LetterContent }) {
  return (
    <span className="flex h-full flex-col items-center justify-center">
      <span style={eyebrow}>{c.occasion || "You're invited"}</span>
      <span className="mt-[2cqw]" style={{ fontFamily: "var(--formal)", fontWeight: 500, fontSize: cq(9), lineHeight: 1.1 }}>
        For {firstName(c.recipientName)}
      </span>
      <EnvelopeDrawing initials={monogram(c.senderName)} idPrefix="thumb-envelope" className="mt-[5cqw] block h-auto w-[86cqw]" />
      <span
        className="mt-[5cqw] rounded-full px-[5cqw] py-[2.4cqw]"
        style={{ background: "var(--accent)", color: "var(--accent-ink)", fontSize: cq(3.4), fontWeight: 600 }}
      >
        Break the seal
      </span>
    </span>
  )
}

function MapThumb({ c }: { c: LetterContent }) {
  const initial = Array.from((c.senderName ?? "").trim())[0]?.toUpperCase() ?? "M"
  return (
    <span className="flex h-full flex-col items-center justify-center">
      <span
        className="relative flex w-[64cqw] flex-col items-center px-[5cqw] text-center"
        style={{ ...parchment, aspectRatio: "0.62", justifyContent: "center", borderRadius: cq(0.8), boxShadow: "0 5cqw 10cqw -5cqw rgba(0,0,0,0.7)" }}
      >
        <span className="pointer-events-none absolute inset-[2.4cqw] border opacity-60" style={{ borderColor: ink }} />
        <span className="pointer-events-none absolute inset-x-1/2 inset-y-0 w-[2cqw] -translate-x-1/2" style={{ background: "linear-gradient(90deg, transparent, rgba(60,35,15,0.22), transparent)" }} />
        <span className="relative italic opacity-75" style={{ fontSize: cq(3.4), fontFamily: "var(--body)" }}>
          a map for
        </span>
        <span className="relative" style={{ ...displayStyle, fontSize: cq(10), lineHeight: 1.05 }}>
          {firstName(c.recipientName)}
        </span>
        <Compass className="relative mt-[4cqw] block w-[17cqw]" />
        <span
          className="relative mt-[5cqw] flex items-center justify-center rounded-full"
          style={{
            width: cq(14),
            height: cq(14),
            background:
              "radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--paper-accent) 62%, #fff) 0%, var(--paper-accent) 48%, color-mix(in srgb, var(--paper-accent) 55%, #000) 100%)",
            boxShadow: "0 1cqw 2cqw rgba(0,0,0,0.4)",
          }}
        >
          <span style={{ ...displayStyle, fontSize: cq(5.6), lineHeight: 1, color: "color-mix(in srgb, var(--paper-accent) 30%, #fff)" }}>{initial}</span>
        </span>
      </span>
      <span className="mt-[6cqw] text-[var(--page-muted)]" style={{ fontSize: cq(3.2) }}>
        Break the seal to open it
      </span>
    </span>
  )
}

function AdventThumb({ c }: { c: CalendarContent }) {
  const total = c.doors.length || 24
  // A calendar a few days into December: the first doors open, the rest locked.
  const openUpTo = 5
  return (
    <span className="flex h-full flex-col items-center justify-center px-[6cqw]">
      <span style={eyebrow}>For {firstName(c.recipientName)}</span>
      <span className="mt-[2cqw] text-center" style={{ ...displayStyle, ...lining, fontSize: cq(9), lineHeight: 1.05 }}>
        {c.headline}
      </span>
      <span className="mt-[6cqw] grid w-full grid-cols-6 gap-[1.6cqw]">
        {Array.from({ length: Math.min(total, 24) }, (_, i) => {
          const day = i + 1
          const open = day <= openUpTo
          return (
            <span
              key={day}
              className="flex flex-col justify-between p-[1.2cqw]"
              style={{
                aspectRatio: "4 / 5",
                borderRadius: cq(1.6),
                ...(open ? { ...paperStyle, boxShadow: "0 1cqw 2cqw -1cqw rgba(0,0,0,0.6)" } : { background: "var(--wrap)", color: "var(--wrap-ink)" }),
                ...(day === openUpTo ? { boxShadow: `0 0 0 ${cq(0.5)} var(--accent)` } : {}),
              }}
            >
              <span className="flex items-start justify-between">
                <span className={open ? "" : "opacity-55"} style={{ ...displayStyle, ...lining, fontSize: cq(4.2), lineHeight: 1 }}>
                  {day}
                </span>
                {open ? <MoonPhase lit={day / total} size={8} className="text-[var(--paper-accent)]" /> : null}
              </span>
            </span>
          )
        })}
      </span>
    </span>
  )
}

function CountdownThumb({ c }: { c: CalendarContent }) {
  const total = c.doors.length
  const shown = c.doors.slice(0, 6)
  const openUpTo = 2
  return (
    <span className="flex h-full flex-col items-center justify-center px-[7cqw]">
      <span style={eyebrow}>For {firstName(c.recipientName)}</span>
      <span className="mt-[2cqw] text-balance text-center" style={{ ...displayStyle, fontSize: cq(8.4), lineHeight: 1.05 }}>
        {c.headline}
      </span>
      <span className="mt-[6cqw] grid w-full grid-cols-3 gap-[2.4cqw]">
        {shown.map((door) => {
          const open = door.day <= openUpTo
          const toGo = Math.max(1, total - door.day + 1)
          return (
            <span key={door.day} className="flex flex-col overflow-hidden text-center" style={{ borderRadius: cq(2.4) }}>
              <span
                className="block py-[1.2cqw]"
                style={{
                  fontSize: cq(2.2),
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  ...(open ? { background: "var(--accent)", color: "var(--accent-ink)" } : { background: "var(--wrap-shade)", color: "var(--wrap-ink)", opacity: 0.9 }),
                }}
              >
                {open ? "Open" : "Locked"}
              </span>
              <span
                className="flex flex-col items-center py-[2.4cqw]"
                style={open ? paperStyle : { background: "var(--wrap)", color: "var(--wrap-ink)" }}
              >
                <span className={open ? "" : "opacity-50"} style={{ ...displayStyle, ...lining, fontSize: cq(8), lineHeight: 1 }}>
                  {toGo}
                </span>
                <span className={open ? "text-[var(--paper-muted)]" : "opacity-60"} style={{ fontSize: cq(2), fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  {toGo === 1 ? "day to go" : "days to go"}
                </span>
              </span>
            </span>
          )
        })}
      </span>
    </span>
  )
}

function Drawing({ id }: { id: TemplateId }) {
  switch (id) {
    case "classic-envelope":
      return <EnvelopeThumb c={letterFixtures[id]} />
    case "gift-reveal":
      return <GiftThumb c={letterFixtures[id]} />
    case "wedding-invite":
      return <WeddingThumb c={letterFixtures[id]} />
    case "party-invite":
      return <PartyThumb c={letterFixtures[id]} />
    case "postcard":
      return <PostcardThumb c={letterFixtures[id]} />
    case "gift-box-3d":
      return <Box3DThumb c={letterFixtures[id]} mood="gift" />
    case "party-box":
      return <Box3DThumb c={letterFixtures[id]} mood="party" />
    case "treasure-map":
      return <MapThumb c={letterFixtures[id]} />
    case "wedding-envelope-3d":
      return <Envelope3DThumb c={letterFixtures[id]} />
    case "advent-classic":
      return <AdventThumb c={calendarFixtures[id]} />
    case "countdown":
      return <CountdownThumb c={calendarFixtures[id]} />
    default: {
      // A new template id without a drawing fails the type check here.
      const missing: never = id
      return missing
    }
  }
}

function themeFor(id: TemplateId) {
  return id === "advent-classic" || id === "countdown" ? calendarFixtures[id].theme : letterFixtures[id].theme
}

// The still drawing on its own, for anywhere that wants just the picture.
export function TemplateThumbnail({ id, className = "" }: { id: TemplateId; className?: string }) {
  const theme = themeFor(id)
  return (
    <span
      aria-hidden="true"
      data-template-thumbnail={id}
      className={`${letterFontVariables} relative block select-none overflow-hidden ${className}`}
      style={{
        ...themeStyle(theme),
        containerType: "inline-size",
        aspectRatio: "4 / 5",
        background: "var(--page)",
        color: "var(--page-ink)",
        fontFamily: "var(--body)",
      }}
    >
      {paletteOf(theme).dark ? <Sky /> : null}
      <span className="relative block h-full">
        <Drawing id={id} />
      </span>
    </span>
  )
}

type Props = {
  id: string
  className?: string
  // "responsive": picture beside the words on phones, above them from 768 px.
  orientation?: "vertical" | "responsive"
  // Extra lines under the description: a plan badge, a call to action.
  children?: ReactNode
}

export function TemplateCard({ id, className = "", orientation = "vertical", children }: Props) {
  const meta = getTemplate(id)
  if (!meta) return null
  const row = orientation === "responsive"
  return (
    <span
      className={`flex gap-4 rounded-3xl bg-night-velvet p-3 text-left text-night-petal ring-1 ring-inset ring-night-petal/10 ${
        row ? "flex-row items-center md:flex-col md:items-stretch md:gap-0" : "flex-col"
      } ${className}`}
    >
      <TemplateThumbnail id={meta.id} className={`rounded-[18px] ${row ? "w-[38%] max-w-[220px] shrink-0 md:w-full md:max-w-none" : "w-full"}`} />
      <span className={`block min-w-0 ${row ? "py-1 pr-1 md:px-2 md:pb-2 md:pt-4" : "px-2 pb-2 pt-4"}`}>
        <span className="block font-display text-xl leading-snug">{meta.name}</span>
        <span className="mt-1 block text-[15px] leading-relaxed text-night-lilac">{meta.description}</span>
        {children}
      </span>
    </span>
  )
}
