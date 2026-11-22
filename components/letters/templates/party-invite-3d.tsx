"use client"

// party-invite-3d (issue #99): a party invitation as a ticket in 3D. Tapping
// tears the stub off; two cannons fire confetti that flutters down and settles
// on the floor, and the ticket flips to show when and where. Then the page is
// the invitation: the ticket's details, a countdown, a maps link and a
// calendar file, the note with the voice note, and any gifts.
//
// three.js is never imported here. The scene module is fetched with import()
// after mounting, and only when motion is allowed and the browser has WebGL
// (../three-kit/reveal.ts). Until it is ready, and whenever it cannot run, the
// page shows a still drawing of the ticket and the button opens it at once.
import { useCallback, useMemo, type CSSProperties } from "react"
import type { LetterContent } from "@/lib/letters/schema"
import { displayStyle, focusRing, MadeWith, paperStyle, Stars } from "../chrome"
import { countdownTo, eventDateParts, formatEventTime, parseEventStart } from "../event-time"
import { GiftList } from "../gift-card"
import { useLetter } from "../letter-context"
import { Paragraphs, SignOff } from "../letter-text"
import { wholeName } from "../names"
import { paletteOf } from "../theme"
import { VoiceNoteSlot } from "../voice-player"
import { TicketDrawing } from "./party-invite-3d/drawing"
import { ticketWords } from "./party-invite-3d/words"
import { EventActions } from "./three-kit/event-actions"
import { readColors, readFonts } from "./three-kit/paper"
import { useThreeReveal, type SceneHandlers } from "./three-kit/reveal"
// Types only: erased at build time, so this does not pull three.js in.
import type { TicketScene } from "./party-invite-3d/scene"

const actionClass =
  "flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[15px] font-semibold transition-transform duration-200 hover:-translate-y-px active:translate-y-0"
const actionStyle: CSSProperties = { background: "var(--accent)", color: "var(--accent-ink)" }

// Confetti that has already landed, above the ticket: [x %, y px, rotation, colour].
const LANDED: [number, number, number, string][] = [
  [6, 10, 24, "var(--accent)"],
  [19, 2, -18, "#f6c453"],
  [33, 16, 50, "var(--accent-soft)"],
  [52, 4, -36, "var(--paper-accent)"],
  [66, 14, 12, "var(--accent)"],
  [81, 6, -50, "#f6c453"],
  [94, 18, 30, "var(--accent-soft)"],
]

export function PartyInvite3D({ content }: { content: LetterContent }) {
  const { slug } = useLetter()
  const event = content.event
  const start = useMemo(() => parseEventStart(event?.startsAt), [event?.startsAt])
  const parts = start ? eventDateParts(start) : null
  const name = wholeName(content.recipientName)
  const dark = paletteOf(content.theme).dark

  const load = useCallback(
    (el: HTMLElement, handlers: SceneHandlers): Promise<TicketScene> =>
      import("./party-invite-3d/scene").then(({ createTicketScene }) =>
        createTicketScene(el, {
          colors: readColors(el),
          fonts: readFonts(el, content.theme?.font === "script"),
          words: ticketWords(content, parseEventStart(content.event?.startsAt)),
          ...handlers,
        }),
      ),
    [content],
  )
  const { stage, live, stageRef, headingRef, open } = useThreeReveal({ load, holdMs: 900 })
  // Only shown once the ticket is open, which happens in the browser, so the
  // server and the browser never disagree about today.
  const toGo = stage === "open" && start ? countdownTo(start.instant, new Date()) : null

  return (
    <main className="relative min-h-[100svh] overflow-hidden" style={{ background: "var(--page)", color: "var(--page-ink)" }}>
      {dark ? <Stars /> : null}

      {stage !== "open" ? (
        <div className="relative min-h-[100svh]">
          <div ref={stageRef} aria-hidden="true" onClick={() => void open()} className="pt-stage absolute inset-0 cursor-pointer" data-live={live ? "true" : "false"}>
            <span className="pt-still absolute inset-x-0 top-[53%] flex -translate-y-1/2 justify-center">
              <TicketDrawing forName={`For ${name}`} occasion={content.occasion || "You're invited"} className="pt-still-art h-auto w-[min(64vw,46svh,320px)]" />
            </span>
          </div>

          <div className="pointer-events-none relative flex min-h-[100svh] flex-col items-center justify-between px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-14 sm:pt-16">
            <div className={`pt-words text-center ${stage !== "closed" ? "opacity-0" : ""}`}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[var(--page-muted)]">{content.occasion || "You're invited"}</p>
              <h1 className="mt-3 text-balance text-[34px] leading-tight sm:text-[42px]" style={displayStyle}>
                You&rsquo;re on the list, {name}
              </h1>
            </div>

            <button
              type="button"
              onClick={() => void open()}
              disabled={stage !== "closed"}
              aria-label={`Tear the ticket: the invitation from ${content.senderName}`}
              className={`pointer-events-auto rounded-full bg-[var(--accent)] px-7 py-3.5 text-[15px] font-semibold text-[var(--accent-ink)] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)] transition-[opacity,transform] duration-300 ease-calm hover:-translate-y-px active:translate-y-0 ${
                stage !== "closed" ? "opacity-0" : ""
              } ${focusRing}`}
            >
              Tear the ticket
            </button>
          </div>
        </div>
      ) : (
        <div className="relative mx-auto max-w-[480px] px-4 pb-12 pt-10 sm:pt-16">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-16">
            {LANDED.map(([x, y, r, color], i) => (
              <span key={i} className="landed absolute h-[7px] w-[12px] rounded-[2px]" style={{ left: `${x}%`, top: `${y}px`, background: color, transform: `rotate(${r}deg)`, animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
          <p className="rise text-center text-[12px] font-semibold uppercase tracking-[0.28em] text-[var(--page-muted)]">
            For {name}
            {content.occasion ? <span aria-hidden="true"> · </span> : null}
            {content.occasion ? <span>{content.occasion}</span> : null}
          </p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="rise mt-3 text-balance text-center text-[36px] leading-[1.06] tracking-[-0.01em] outline-none sm:text-[44px]"
            style={{ ...displayStyle, animationDelay: "80ms" }}
          >
            {content.headline}
          </h1>

          {event ? (
            <section aria-label="When and where" className="card-in relative mt-8 overflow-hidden rounded-[18px] text-[var(--deep-ink)] shadow-[0_30px_70px_-30px_rgba(0,0,0,0.6)]" style={{ background: "var(--deep)" }}>
              <div className="px-6 pb-6 pt-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[var(--accent)]">Admit one</p>
                <p className="mt-2 text-[28px] leading-tight" style={displayStyle}>
                  {event.title}
                </p>
                {start && parts ? (
                  <p className="mt-4 text-[17px] font-semibold" style={{ fontVariantNumeric: "lining-nums" }}>
                    {parts.weekday}, {parts.day} {parts.month} · {formatEventTime(start)}
                  </p>
                ) : null}
                <p className="mt-1 text-[16px]">{event.locationName}</p>
                {event.address ? <p className="text-[14px] opacity-75">{event.address}</p> : null}
              </div>
              {/* The perforation, with the stub that was torn off. */}
              <div aria-hidden="true" className="relative h-0 border-t-2 border-dashed border-[color-mix(in_srgb,var(--deep-ink)_35%,transparent)]">
                <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full" style={{ background: "var(--page-flat)" }} />
                <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full" style={{ background: "var(--page-flat)" }} />
              </div>
              <div className="flex items-center justify-between gap-4 px-6 py-4">
                <p className="text-[13px] font-semibold uppercase tracking-[0.18em] opacity-80">
                  {toGo && !toGo.past ? (toGo.days === 0 ? "Tonight" : `${toGo.days} ${toGo.days === 1 ? "day" : "days"} to go`) : "See you there"}
                </p>
                <p className="text-[13px] opacity-70">from {content.senderName}</p>
              </div>
            </section>
          ) : null}

          <EventActions content={content} start={start} slug={slug} className="rise mt-6" actionClass={`${actionClass}`} actionStyle={actionStyle} />

          <article className="rise mt-6 rounded-[22px] px-6 pb-9 pt-8 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)]" style={{ ...paperStyle, animationDelay: "600ms" }}>
            {/* The host's voice, above their note. */}
            <VoiceNoteSlot tone="paper" className="mb-7 border-b border-[var(--line)] pb-6" />
            <Paragraphs body={content.body} />
            <SignOff signOff={content.signOff} senderName={content.senderName} className="mt-8" />
          </article>

          <GiftList gifts={content.gifts} />
          <MadeWith />
        </div>
      )}

      <style>{`
        .pt-still { transition: opacity 600ms cubic-bezier(0.22, 0.61, 0.36, 1); }
        .pt-words { transition: opacity 400ms ease-out; }
        .pt-stage[data-live="true"] .pt-still { opacity: 0; }
        @media (prefers-reduced-motion: no-preference) {
          .pt-stage[data-live="false"] .pt-still-art { animation: pt-idle 4.5s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
          .rise { animation: rise 900ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
          .card-in { animation: card-in 1000ms cubic-bezier(0.22, 0.61, 0.36, 1) 150ms both; }
          .landed { animation: landed 900ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
        }
        @keyframes pt-idle { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-7px) rotate(1.2deg); } }
        @keyframes rise { from { opacity: 0; transform: translateY(14px); } }
        @keyframes card-in { from { opacity: 0; transform: translateY(50px) rotateX(18deg); } }
        @keyframes landed { from { opacity: 0; translate: 0 -40px; } }
      `}</style>
    </main>
  )
}
