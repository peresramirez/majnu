"use client"

// wedding-invite-3d (issue #99): a wedding invitation as a pop-up card in 3D.
// Tapping it lifts the cover; three layers of cut paper unfold from the fold
// into a tunnel of arches around the couple's names and the date, and petals
// drift down. Then the page is the invitation: the card with the date, time
// and place, a maps link and a calendar file, the note with the voice note,
// and any gifts.
//
// three.js is never imported here. The scene module is fetched with import()
// after mounting, and only when motion is allowed and the browser has WebGL
// (../three-kit/reveal.ts). Until it is ready, and whenever it cannot run, the
// page shows a still drawing of the card and the button opens it at once.
import { useCallback, useMemo, type CSSProperties } from "react"
import type { LetterContent } from "@/lib/letters/schema"
import { displayStyle, focusRing, MadeWith, Ornament, paperStyle, Stars } from "../chrome"
import { eventDateParts, formatEventTime, parseEventStart } from "../event-time"
import { GiftList } from "../gift-card"
import { useLetter } from "../letter-context"
import { Paragraphs, SignOff } from "../letter-text"
import { wholeName } from "../names"
import { paletteOf } from "../theme"
import { VoiceNoteSlot } from "../voice-player"
import { EventActions } from "./three-kit/event-actions"
import { readColors, readFonts } from "./three-kit/paper"
import { useThreeReveal, type SceneHandlers } from "./three-kit/reveal"
import { coupleNames } from "./wedding-envelope-3d/layout"
import { InviteCardDrawing } from "./wedding-invite-3d/drawing"
import { inviteWords } from "./wedding-invite-3d/words"
// Types only: erased at build time, so this does not pull three.js in.
import type { InviteScene } from "./wedding-invite-3d/scene"

const actionClass =
  "flex flex-1 items-center justify-center gap-2 rounded-full border px-5 py-3.5 text-[14px] font-medium uppercase tracking-[0.16em] transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--page-ink)_8%,transparent)]"
const actionStyle: CSSProperties = { borderColor: "color-mix(in srgb, var(--page-ink) 40%, transparent)", color: "var(--page-ink)" }

export function WeddingInvite3D({ content }: { content: LetterContent }) {
  const { slug } = useLetter()
  const event = content.event
  const start = useMemo(() => parseEventStart(event?.startsAt), [event?.startsAt])
  const parts = start ? eventDateParts(start) : null
  const name = wholeName(content.recipientName)
  const names = coupleNames(content.senderName)
  const dark = paletteOf(content.theme).dark
  const script = content.theme?.font === "script"
  const formal: CSSProperties = { fontFamily: "var(--formal)", fontWeight: 500 }

  const load = useCallback(
    (el: HTMLElement, handlers: SceneHandlers): Promise<InviteScene> =>
      import("./wedding-invite-3d/scene").then(({ createInviteScene }) =>
        createInviteScene(el, {
          colors: readColors(el),
          fonts: readFonts(el, content.theme?.font === "script"),
          words: inviteWords(content, parseEventStart(content.event?.startsAt)),
          ...handlers,
        }),
      ),
    [content],
  )
  const { stage, live, stageRef, headingRef, open } = useThreeReveal({ load, holdMs: 1100 })

  return (
    <main className="relative min-h-[100svh] overflow-hidden" style={{ background: "var(--page)", color: "var(--page-ink)" }}>
      {dark ? <Stars /> : null}

      {stage !== "open" ? (
        <div className="relative min-h-[100svh]">
          <div ref={stageRef} aria-hidden="true" onClick={() => void open()} className="wi-stage absolute inset-0 cursor-pointer" data-live={live ? "true" : "false"}>
            <span className="wi-still absolute inset-x-0 top-[54%] flex -translate-y-1/2 justify-center">
              <InviteCardDrawing names={names || content.senderName} forName={`For ${name}`} className="wi-still-art h-auto w-[min(88vw,58svh,440px)]" />
            </span>
          </div>

          <div className="pointer-events-none relative flex min-h-[100svh] flex-col items-center justify-between px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-14 sm:pt-16">
            <div className={`wi-words text-center ${stage !== "closed" ? "opacity-0" : ""}`}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[var(--page-muted)]">{content.occasion || "You're invited"}</p>
              <h1 className="mt-3 text-balance text-[38px] leading-tight sm:text-[46px]" style={formal}>
                For {name}
              </h1>
            </div>

            <button
              type="button"
              onClick={() => void open()}
              disabled={stage !== "closed"}
              aria-label={`Open the invitation from ${content.senderName}`}
              className={`pointer-events-auto rounded-full bg-[var(--accent)] px-7 py-3.5 text-[15px] font-semibold text-[var(--accent-ink)] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)] transition-[opacity,transform] duration-300 ease-calm hover:-translate-y-px active:translate-y-0 ${
                stage !== "closed" ? "opacity-0" : ""
              } ${focusRing}`}
            >
              Open the invitation
            </button>
          </div>
        </div>
      ) : (
        <div className="relative mx-auto max-w-[520px] px-4 pb-12 pt-10 sm:pt-14">
          <p className="rise text-center text-[12px] font-semibold uppercase tracking-[0.28em] text-[var(--page-muted)]">
            For {name}
            {content.occasion ? <span aria-hidden="true"> · </span> : null}
            {content.occasion ? <span>{content.occasion}</span> : null}
          </p>

          {/* The open card, now as words on the page: arches of cut paper round it. */}
          <article className="card-in relative mt-5 overflow-hidden rounded-[4px] px-8 pb-12 pt-12 text-center sm:px-12" style={{ ...paperStyle, boxShadow: "0 40px 80px -40px rgba(0,0,0,0.7), 0 10px 24px -14px rgba(0,0,0,0.4)" }}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-[10px] rounded-t-[999px] rounded-b-[999px] border-2 border-[color-mix(in_srgb,var(--paper-accent)_55%,transparent)]" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-[18px] rounded-t-[999px] rounded-b-[999px] border border-[color-mix(in_srgb,var(--accent-soft)_70%,transparent)]" />

            {names ? (
              <p className="mt-6 text-balance text-[42px] leading-[1.05] text-[var(--paper-accent)] sm:text-[52px]" style={formal}>
                {names}
              </p>
            ) : null}
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="mx-auto mt-4 max-w-[22ch] text-balance text-[23px] leading-snug outline-none sm:text-[26px]"
              style={{ ...displayStyle, fontStyle: script ? "normal" : "italic" }}
            >
              {content.headline}
            </h1>

            <Ornament className="mt-7 text-[var(--paper-accent)]" />
            {event && start && parts ? (
              <div className="mb-6">
                <p className="mt-6 text-[12px] font-semibold uppercase tracking-[0.3em] text-[var(--paper-muted)]">{parts.weekday}</p>
                <p className="mt-2 text-[30px] leading-tight" style={{ ...formal, fontVariantNumeric: "lining-nums" }}>
                  {parts.day} {parts.month} {parts.year}
                </p>
                <p className="mt-1 text-[17px] text-[var(--paper-muted)]">at {formatEventTime(start)}</p>
                <p className="mt-6 text-[24px] leading-tight" style={formal}>
                  {event.locationName}
                </p>
                {event.address ? <p className="mx-auto mt-1 max-w-[28ch] text-[15px] leading-relaxed text-[var(--paper-muted)]">{event.address}</p> : null}
              </div>
            ) : null}
          </article>

          <EventActions content={content} start={start} slug={slug} className="rise mt-8" actionClass={actionClass} actionStyle={actionStyle} />

          <section
            aria-label={`A note from ${content.senderName || "the hosts"}`}
            className="rise mt-6 rounded-[4px] px-6 pb-9 pt-8 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)] sm:px-8"
            style={{ ...paperStyle, animationDelay: "600ms" }}
          >
            {/* The couple's voice, above their note. */}
            <VoiceNoteSlot tone="paper" className="mb-7 border-b border-[var(--line)] pb-6" />
            <Paragraphs body={content.body} />
            <SignOff signOff={content.signOff} senderName={content.senderName} className="mt-8" />
          </section>

          <GiftList gifts={content.gifts} />
          <MadeWith />
        </div>
      )}

      <style>{`
        .wi-still { transition: opacity 600ms cubic-bezier(0.22, 0.61, 0.36, 1); }
        .wi-words { transition: opacity 400ms ease-out; }
        .wi-stage[data-live="true"] .wi-still { opacity: 0; }
        @media (prefers-reduced-motion: no-preference) {
          .wi-stage[data-live="false"] .wi-still-art { animation: wi-idle 6s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
          .rise { animation: rise 900ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
          .card-in { animation: card-in 1100ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
        }
        @keyframes wi-idle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes rise { from { opacity: 0; transform: translateY(14px); } }
        @keyframes card-in { from { opacity: 0; transform: translateY(60px) scale(0.94); } }
      `}</style>
    </main>
  )
}
