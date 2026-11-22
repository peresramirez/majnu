"use client"

// advent-classic and countdown. A grid of doors: doors whose day has come can
// be opened to read the day's note and any gift; locked doors show only their
// number and opening date. Locked doors arrive from the server without their
// title, message or gift (PublicDoor in lib/letters/schema.ts), so there is
// nothing on the page to peek at.
//
// advent-classic: numbered doors, each with a moon one step fuller than the last.
// countdown: tear-off calendar pages counting the days that are left.
import { useCallback, useEffect, useRef, useState } from "react"
import { MoonPhase } from "@/components/brand/moon-phase"
import type { PublicCalendarContent, PublicDoor } from "@/lib/letters/schema"
import { bodyStyle, displayStyle, focusRing, MadeWith, paperStyle, signOffStyle } from "@/components/letters/chrome"
import { GiftCard } from "@/components/letters/gift-card"
import { useLetter, useMounted, useReducedMotion } from "@/components/letters/letter-context"
import { firstName } from "@/components/letters/names"
import { dayParts, formatDay, todayIn } from "./dates"

type Variant = "advent" | "countdown"
type OpenDoor = Extract<PublicDoor, { locked: false }>

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <rect x="3.5" y="7" width="9" height="7" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function AdventDoor({
  door,
  total,
  opened,
  today,
  onOpen,
  onLocked,
}: {
  door: PublicDoor
  total: number
  opened: boolean
  today: boolean
  onOpen: (door: OpenDoor) => void
  onLocked: (door: PublicDoor) => void
}) {
  const locked = door.locked
  const label = locked
    ? `Door ${door.day}, opens ${formatDay(door.opensOn)}`
    : `Door ${door.day}${today ? ", today" : ""}${opened ? ", opened" : ""}`
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={locked || undefined}
      onClick={() => (door.locked ? onLocked(door) : onOpen(door))}
      className={`door relative aspect-[4/5] rounded-[12px] text-left ${focusRing}`}
      data-state={locked ? "locked" : opened ? "opened" : "ready"}
      data-today={today || undefined}
    >
      {/* What is behind the leaf, once it swings open */}
      {locked ? null : (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-[12px]"
          style={{ background: "var(--deep)", color: "var(--deep-ink)" }}
        >
          <MoonPhase lit={1} size={26} className="text-[var(--accent)]" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">Opened</span>
        </span>
      )}

      {/* The door leaf */}
      <span
        aria-hidden="true"
        className="door-leaf absolute inset-0 flex flex-col justify-between rounded-[12px] p-2.5"
        style={
          locked
            ? { background: "var(--wrap)", color: "var(--wrap-ink)" }
            : { ...paperStyle, boxShadow: "0 10px 22px -14px rgba(0,0,0,0.6)" }
        }
      >
        <span className="flex items-start justify-between">
          <span className={`text-[30px] leading-none sm:text-[34px] ${locked ? "opacity-55" : ""}`} style={displayStyle}>
            {door.day}
          </span>
          {locked ? (
            <LockIcon className="mt-0.5 h-3.5 w-3.5 opacity-50" />
          ) : (
            <MoonPhase lit={door.day / total} size={18} className="text-[var(--paper-accent)]" />
          )}
        </span>
        <span className={`text-[10.5px] font-semibold uppercase tracking-[0.12em] ${locked ? "opacity-55" : "text-[var(--paper-muted)]"}`}>
          {today && !locked ? "Today" : formatDay(door.opensOn, "short")}
        </span>
      </span>
    </button>
  )
}

function CountdownPage({
  door,
  total,
  opened,
  today,
  onOpen,
  onLocked,
}: {
  door: PublicDoor
  total: number
  opened: boolean
  today: boolean
  onOpen: (door: OpenDoor) => void
  onLocked: (door: PublicDoor) => void
}) {
  const locked = door.locked
  const toGo = Math.max(1, total - door.day + 1)
  const parts = dayParts(door.opensOn)
  const label = locked
    ? `${toGo} to go, opens ${formatDay(door.opensOn)}`
    : `${toGo} to go, ${formatDay(door.opensOn)}${today ? ", today" : ""}${opened ? ", opened" : ""}`
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={locked || undefined}
      onClick={() => (door.locked ? onLocked(door) : onOpen(door))}
      className={`tearoff relative flex w-full flex-col overflow-hidden rounded-[14px] text-center ${focusRing}`}
      data-state={locked ? "locked" : opened ? "opened" : "ready"}
      data-today={today || undefined}
      style={{ boxShadow: locked ? "none" : "0 14px 28px -18px rgba(0,0,0,0.55)" }}
    >
      <span
        aria-hidden="true"
        className="relative flex h-9 items-center justify-center text-[11px] font-bold uppercase tracking-[0.14em]"
        style={locked ? { background: "var(--wrap-shade)", color: "var(--wrap-ink)" } : { background: "var(--accent)", color: "var(--accent-ink)" }}
      >
        {/* Binder holes, kept to the edges so the label fits a 100 px page */}
        <span className="absolute left-2.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-black/25" />
        <span className="absolute right-2.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-black/25" />
        <span className={`flex items-center gap-1 ${locked ? "opacity-70" : ""}`}>
          {locked ? (
            <>
              <LockIcon className="h-3 w-3" />
              <span className="hidden sm:inline">Locked</span>
            </>
          ) : opened ? (
            "Opened"
          ) : today ? (
            "Today"
          ) : (
            "Open"
          )}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="tearoff-page flex flex-1 flex-col items-center justify-center px-2 pb-3 pt-3"
        style={locked ? { background: "var(--wrap)", color: "var(--wrap-ink)" } : paperStyle}
      >
        <span className={`text-[44px] leading-none tabular-nums ${locked ? "opacity-50" : ""}`} style={displayStyle}>
          {toGo}
        </span>
        <span className={`mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${locked ? "opacity-60" : "text-[var(--paper-muted)]"}`}>
          {toGo === 1 ? "day to go" : "days to go"}
        </span>
        <span className={`mt-2 text-[12px] font-semibold ${locked ? "opacity-60" : "text-[var(--paper-accent)]"}`}>
          {parts.weekday} {parts.day} {parts.month}
        </span>
      </span>
    </button>
  )
}

function DoorDialog({ door, onClose }: { door: OpenDoor | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (door && !el.open) {
      el.showModal()
      // Start at the door's title, not on the first button inside.
      el.querySelector<HTMLElement>("#door-dialog-title")?.focus()
      document.documentElement.style.overflow = "hidden"
    }
    if (!door && el.open) el.close()
    return () => {
      document.documentElement.style.overflow = ""
    }
  }, [door])

  return (
    <dialog
      ref={ref}
      className="door-dialog"
      aria-labelledby="door-dialog-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      {door ? (
        <div className="door-sheet max-h-[88svh] overflow-y-auto rounded-t-[26px] px-6 pb-8 pt-3 sm:rounded-[24px] sm:pt-6" style={paperStyle}>
          <span aria-hidden="true" className="mx-auto mb-5 block h-1 w-10 rounded-full bg-[var(--line)] sm:hidden" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--paper-muted)]">
            Door {door.day} · {formatDay(door.opensOn)}
          </p>
          {/* A door filled with a gift only (issue #48) may have no title or note. */}
          <h2 id="door-dialog-title" tabIndex={-1} className="mt-2 text-balance text-[32px] leading-[1.08] outline-none" style={displayStyle}>
            {door.title.trim() || (door.gift ? "A little something" : `Door ${door.day}`)}
          </h2>
          {door.message.trim() ? (
            <p className="mt-4 whitespace-pre-line" style={bodyStyle}>
              {door.message}
            </p>
          ) : null}
          {door.gift ? <GiftCard gift={door.gift} day={door.day} codeShown eyebrow="Behind this door" className="mt-6" /> : null}
          <button
            type="button"
            onClick={onClose}
            className={`mt-7 w-full rounded-full px-5 py-3.5 text-[15px] font-semibold ${focusRing}`}
            style={{ background: "var(--deep)", color: "var(--deep-ink)" }}
          >
            Close
          </button>
        </div>
      ) : null}
    </dialog>
  )
}

export function Calendar({ content, variant }: { content: PublicCalendarContent; variant: Variant }) {
  const { track } = useLetter()
  const reduced = useReducedMotion()
  const mounted = useMounted()
  const [opened, setOpened] = useState<Set<number>>(() => new Set())
  const [active, setActive] = useState<OpenDoor | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doors = [...(content.doors ?? [])].sort((a, b) => a.day - b.day)
  const total = doors.length
  const openCount = doors.filter((d) => !d.locked).length
  const firstLocked = doors.find((d) => d.locked)
  const today = mounted ? todayIn(content.timezone) : null

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
      if (openTimer.current) clearTimeout(openTimer.current)
    },
    [],
  )

  const openDoor = useCallback(
    (door: OpenDoor) => {
      const already = opened.has(door.day)
      setOpened((prev) => new Set(prev).add(door.day))
      track("door_open", door.day)
      if (openTimer.current) clearTimeout(openTimer.current)
      if (already || reduced) setActive(door)
      else openTimer.current = setTimeout(() => setActive(door), 520)
    },
    [opened, reduced, track],
  )

  const lockedTap = useCallback((door: PublicDoor) => {
    setNotice(`Door ${door.day} opens on ${formatDay(door.opensOn)}.`)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 2600)
  }, [])

  // A date never breaks across lines ("2 December", not "2 / December").
  const nextOn = firstLocked ? formatDay(firstLocked.opensOn).replace(" ", "\u00a0") : ""
  const progress: { lead: string; next: string | null } =
    openCount === 0 && firstLocked
      ? { lead: `The first door opens on ${nextOn}`, next: null }
      : openCount < total && firstLocked
        ? { lead: `${openCount} of ${total} doors open`, next: `The next one opens on ${nextOn}` }
        : { lead: "Every door is open", next: null }

  const Tile = variant === "advent" ? AdventDoor : CountdownPage

  return (
    <main
      className="relative min-h-[100svh] overflow-hidden"
      // Lining figures: old-style ones make 1, 10 and 11 read as I, IO and II.
      style={{ background: "var(--page)", color: "var(--page-ink)", fontVariantNumeric: "lining-nums" }}
    >
      <div className="relative mx-auto max-w-[760px] px-4 pb-12 pt-10 sm:pt-16">
        <header className="cal-rise mx-auto max-w-[520px] text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[var(--page-muted)]">For {firstName(content.recipientName)}</p>
          <h1 className="mt-3 text-balance text-[42px] leading-[1.04] tracking-[-0.01em] sm:text-[56px]" style={displayStyle}>
            {content.headline}
          </h1>
          {content.intro ? (
            <p className="mx-auto mt-4 max-w-[36ch] text-[var(--page-muted)]" style={{ ...bodyStyle, fontSize: "calc(var(--body-size) - 1px)" }}>
              {content.intro}
            </p>
          ) : null}
          <p
            className={`mt-6 inline-flex max-w-full items-center gap-3 px-4 py-2 text-left text-[13px] leading-snug ${progress.next ? "rounded-[20px]" : "rounded-full"}`}
            style={{ background: "color-mix(in srgb, var(--page-ink) 8%, transparent)" }}
          >
            <MoonPhase lit={total ? openCount / total : 0} size={18} className="shrink-0 text-[var(--accent)]" />
            <span>
              <span className="block font-semibold">{progress.lead}</span>
              {progress.next ? <span className="block text-[var(--page-muted)]">{progress.next}</span> : null}
            </span>
          </p>
        </header>

        {variant === "advent" ? (
          <div className="cal-rise mt-9 grid grid-cols-4 gap-2.5 sm:grid-cols-6 sm:gap-3" style={{ animationDelay: "160ms" }}>
            {doors.map((door) => (
              <Tile
                key={door.day}
                door={door}
                total={total}
                opened={opened.has(door.day)}
                today={!!today && door.opensOn.slice(0, 10) === today && !door.locked}
                onOpen={openDoor}
                onLocked={lockedTap}
              />
            ))}
          </div>
        ) : (
          // Countdowns run from 1 to 31 days: rows are centred, so three days
          // sit in the middle rather than in the left of a four-column grid.
          <div className="cal-rise mt-9 flex flex-wrap justify-center gap-3" style={{ animationDelay: "160ms" }}>
            {doors.map((door) => (
              <div key={door.day} className="flex w-[calc((100%-24px)/3)] sm:w-[calc((100%-36px)/4)]">
                <Tile
                  door={door}
                  total={total}
                  opened={opened.has(door.day)}
                  today={!!today && door.opensOn.slice(0, 10) === today && !door.locked}
                  onOpen={openDoor}
                  onLocked={lockedTap}
                />
              </div>
            ))}
          </div>
        )}

        <p className="mt-12 text-center text-[26px]" style={signOffStyle}>
          From {content.senderName}
        </p>
        <MadeWith />
      </div>

      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-10 flex justify-center px-4">
        {notice ? (
          <p className="cal-notice rounded-full px-4 py-2.5 text-[14px] font-medium shadow-lg" style={{ background: "var(--page-ink)", color: "var(--page-flat)" }}>
            {notice}
          </p>
        ) : null}
      </div>

      <DoorDialog door={active} onClose={() => setActive(null)} />

      <style>{`
        .door { perspective: 700px; }
        .door, .tearoff { font-variant-numeric: lining-nums; }
        .door-leaf { transform-origin: 0 50%; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .door[data-state="opened"] .door-leaf { transform: rotateY(-108deg); }
        .door[data-state="locked"] { cursor: default; }
        .door[data-today] .door-leaf { box-shadow: 0 0 0 2px var(--accent), 0 12px 26px -14px rgba(0,0,0,0.6); }
        .tearoff[data-state="locked"] { cursor: default; }
        .tearoff[data-today] { outline: 2px solid var(--accent); outline-offset: 2px; }
        .tearoff[data-state="opened"] .tearoff-page { background-image: linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 18%, transparent), transparent); }
        .door-dialog { padding: 0; border: 0; background: transparent; width: 100%; max-width: 100vw; max-height: 100svh; margin: auto auto 0; color: inherit; }
        .door-dialog::backdrop { background: rgba(12, 8, 18, 0.55); }
        @media (min-width: 640px) { .door-dialog { width: 460px; margin: auto; } }
        @media (prefers-reduced-motion: no-preference) {
          .door-leaf { transition: transform 700ms cubic-bezier(0.22, 0.61, 0.36, 1); }
          .door[data-state="ready"]:hover .door-leaf { transform: rotateY(-10deg); }
          .tearoff { transition: transform 250ms cubic-bezier(0.22, 0.61, 0.36, 1); }
          .tearoff[data-state="ready"]:hover { transform: translateY(-3px); }
          .tearoff[data-state="ready"]:active .tearoff-page { transform: rotateX(18deg); transform-origin: 50% 0; transition: transform 200ms; }
          .door-dialog[open] .door-sheet { animation: sheet-up 480ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
          .door-dialog[open]::backdrop { animation: fade 300ms ease-out both; }
          .cal-rise { animation: cal-rise 900ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
          .cal-notice { animation: cal-rise 260ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
        }
        @keyframes sheet-up { from { opacity: 0; transform: translateY(40px); } }
        @keyframes fade { from { opacity: 0; } }
        @keyframes cal-rise { from { opacity: 0; transform: translateY(12px); } }
      `}</style>
    </main>
  )
}
