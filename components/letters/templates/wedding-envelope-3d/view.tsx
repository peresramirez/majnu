"use client"

// wedding-envelope-3d: an envelope in 3D, sealed with wax, from the three.js
// prototype in docs/templates (src/templates/wedding.js). Breaking the seal
// plays the reveal: the seal cracks, the flap opens, the card slides out to
// face the guest and rose petals fall. Then the page is the invitation: the
// card with the date, time and place, a maps link and a calendar file, the
// message, any gifts and the gift list.
//
// three.js is never imported here. After mounting, and only when motion is
// allowed and the browser has WebGL, the scene module is fetched with
// import(), so the three.js chunk downloads for the 3D templates alone. Until
// it is ready, and whenever it cannot run, the page shows a still drawing of
// the envelope and the button opens the invitation straight away.
//
// This is the client half; ../wedding-envelope-3d.tsx renders it on the server
// with the gift list's claimed ids.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react"
import type { LetterContent } from "@/lib/letters/schema"
import { displayStyle, focusRing, MadeWith, Ornament, paperStyle, Stars } from "../../chrome"
import { buildIcs, eventDateParts, formatEventTime, icsFileName, mapsUrl, parseEventStart, type EventStart } from "../../event-time"
import { GiftList } from "../../gift-card"
import { useLetter } from "../../letter-context"
import { Paragraphs, SignOff } from "../../letter-text"
import { monogram, wholeName } from "../../names"
import { paletteOf } from "../../theme"
import { Wishlist } from "../../wishlist"
import { BrokenSeal, EnvelopeDrawing } from "./drawing"
import { cardWords, coupleNames, hasWebGL } from "./layout"
// Types only: erased at build time, so this does not pull three.js in.
import type { EnvelopeColors, EnvelopeFonts, EnvelopeScene } from "./scene"

type Stage = "closed" | "opening" | "open"

// How long the card stays facing the guest, petals falling, before the page takes over.
const HOLD_MS = 1300

function readColors(el: HTMLElement): EnvelopeColors {
  const s = getComputedStyle(el)
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback
  return {
    paper: v("--paper", "#F7F0E6"),
    paperInk: v("--paper-ink", "#2A1C3A"),
    paperMuted: v("--paper-muted", "#6E5A78"),
    paperAccent: v("--paper-accent", "#B9775A"),
    wrap: v("--wrap", "#33224A"),
    wrapShade: v("--wrap-shade", "#271A39"),
    accent: v("--accent", "#E2A98A"),
    accentSoft: v("--accent-soft", "#CD8DBD"),
  }
}

// Custom properties compute with their var() references resolved, so these
// are the real next/font family names the page itself uses.
function readFonts(el: HTMLElement, content: LetterContent): EnvelopeFonts {
  const s = getComputedStyle(el)
  return {
    formal: s.getPropertyValue("--formal").trim() || "Georgia, serif",
    display: s.getPropertyValue("--display").trim() || "Georgia, serif",
    displayWeight: s.getPropertyValue("--display-weight").trim() || "500",
    body: s.getPropertyValue("--body").trim() || "system-ui, sans-serif",
    script: content.theme?.font === "script",
  }
}

function downloadIcs(content: LetterContent, start: EventStart, slug: string) {
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

// A few petals that drift down once after the card has come out, carrying on
// from the 3D ones. Nothing moves with reduced motion.
const SHOWER: [number, number, number, number, string][] = [
  [6, 0, 7.5, 0.9, "var(--accent-soft)"],
  [19, 1.4, 8.6, 0.7, "var(--accent)"],
  [33, 0.5, 7.9, 1, "color-mix(in srgb, var(--accent-soft) 55%, var(--paper))"],
  [48, 2.1, 9.2, 0.8, "var(--accent-soft)"],
  [61, 0.9, 8.1, 1.1, "var(--accent)"],
  [74, 2.6, 7.4, 0.75, "color-mix(in srgb, var(--accent-soft) 55%, var(--paper))"],
  [86, 0.3, 8.8, 0.95, "var(--accent-soft)"],
  [95, 1.8, 7.7, 0.7, "var(--accent)"],
]

function PetalShower() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      {SHOWER.map(([x, delay, duration, scale, color], i) => (
        <svg
          key={i}
          viewBox="-10 -10 20 20"
          className="petal absolute top-0 h-[18px] w-[18px]"
          style={{ left: `${x}%`, animationDelay: `${delay}s`, animationDuration: `${duration}s`, scale: String(scale) }}
        >
          <path d="M0 -8 C 7 -4.5 7.5 4.5 0 8.5 C -7.5 4.5 -7 -4.5 0 -8 Z" style={{ fill: color }} />
        </svg>
      ))}
    </div>
  )
}

const actionClass =
  "flex flex-1 items-center justify-center gap-2 rounded-full border px-5 py-3.5 text-[14px] font-medium uppercase tracking-[0.16em] transition-colors duration-200"
const actionStyle: CSSProperties = { borderColor: "color-mix(in srgb, var(--page-ink) 40%, transparent)", color: "var(--page-ink)" }

export function WeddingEnvelopeView({ content, claimed }: { content: LetterContent; claimed?: string[] }) {
  const [stage, setStage] = useState<Stage>("closed")
  // True once the 3D scene is drawing over the still picture.
  const [live, setLive] = useState(false)
  const { slug } = useLetter()
  const idPrefix = useId().replace(/:/g, "")
  const stageRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const sceneRef = useRef<EnvelopeScene | null>(null)
  const stageNow = useRef<Stage>("closed")
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const dark = paletteOf(content.theme).dark
  const name = wholeName(content.recipientName)
  const initials = monogram(content.senderName)
  const names = coupleNames(content.senderName)
  const event = content.event
  const start = useMemo(() => parseEventStart(event?.startsAt), [event?.startsAt])
  const parts = start ? eventDateParts(start) : null
  const script = content.theme?.font === "script"
  const formal: CSSProperties = { fontFamily: "var(--formal)", fontWeight: 500 }

  const go = useCallback((next: Stage) => {
    stageNow.current = next
    setStage(next)
  }, [])

  const open = useCallback(async () => {
    if (stageNow.current !== "closed") return
    const scene = sceneRef.current
    if (!scene || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      go("open")
      return
    }
    go("opening")
    try {
      await scene.open()
    } catch {
      // Whatever went wrong in the scene, the invitation still opens.
    }
    timers.current.push(setTimeout(() => go("open"), HOLD_MS))
  }, [go])
  const openRef = useRef(open)
  openRef.current = open

  // Load three.js and the scene on demand.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !hasWebGL()) return
    let cancelled = false
    let created: EnvelopeScene | null = null
    const stop = () => {
      created?.dispose()
      created = null
      sceneRef.current = null
      setLive(false)
    }
    import("./scene")
      .then(({ createEnvelopeScene }) =>
        cancelled
          ? null
          : createEnvelopeScene(el, {
              colors: readColors(el),
              fonts: readFonts(el, content),
              words: cardWords(content, parseEventStart(content.event?.startsAt)),
              monogram: monogram(content.senderName),
              onTap: () => void openRef.current(),
              onLost: () => {
                stop()
                if (stageNow.current === "opening") go("open")
              },
            }),
      )
      .then((scene) => {
        if (!scene) return
        if (cancelled || stageNow.current !== "closed") {
          scene.dispose()
          return
        }
        created = scene
        sceneRef.current = scene
        setLive(true)
      })
      .catch(() => {
        // No WebGL after all, or the chunk did not load: the still drawing stays.
      })
    return () => {
      cancelled = true
      stop()
    }
  }, [content, go])

  // Once the page has taken over, free the GPU.
  useEffect(() => {
    if (stage !== "open") return
    sceneRef.current?.dispose()
    sceneRef.current = null
    headingRef.current?.focus({ preventScroll: true })
  }, [stage])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  return (
    <main className="relative min-h-[100svh] overflow-hidden" style={{ background: "var(--page)", color: "var(--page-ink)" }}>
      {/* On dark palettes, stars in the sky below the words of the closed
          screen, where they never sit behind a letter. The open invitation
          has none: the card is the thing to look at. */}
      {dark && stage !== "open" ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[30svh] h-[70svh]">
          <Stars />
        </div>
      ) : null}

      {stage !== "open" ? (
        <div className="relative min-h-[100svh]">
          {/* The scene fills the first screen, so petals fall from the top
              edge and never meet a box. The words sit on top of it. */}
          <div ref={stageRef} aria-hidden="true" onClick={() => void open()} className="env-stage absolute inset-0 cursor-pointer" data-live={live ? "true" : "false"}>
            <span className="env-still absolute inset-x-0 top-[53%] flex -translate-y-1/2 justify-center">
              <EnvelopeDrawing initials={initials} idPrefix={idPrefix} className="env-still-art h-auto w-[min(89vw,59svh)]" />
            </span>
          </div>

          <div className="pointer-events-none relative flex min-h-[100svh] flex-col items-center justify-between px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-14 sm:pt-16">
            <div className={`env-words text-center ${stage !== "closed" ? "opacity-0" : ""}`}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[var(--page-muted)]">{content.occasion || "You're invited"}</p>
              <h1 className="mt-3 text-balance text-[38px] leading-tight sm:text-[46px]" style={formal}>
                For {name}
              </h1>
            </div>

            <button
              type="button"
              onClick={() => void open()}
              disabled={stage !== "closed"}
              aria-label={`Break the seal: the invitation from ${content.senderName}`}
              className={`pointer-events-auto rounded-full bg-[var(--accent)] px-7 py-3.5 text-[15px] font-semibold text-[var(--accent-ink)] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)] transition-[opacity,transform] duration-300 ease-calm hover:-translate-y-px ${
                stage !== "closed" ? "opacity-0" : ""
              } ${focusRing}`}
            >
              Break the seal
            </button>
          </div>
        </div>
      ) : (
        <div className="relative mx-auto max-w-[520px] px-4 pb-12 pt-8 sm:pt-14">
          <PetalShower />
          <BrokenSeal initials={initials} idPrefix={idPrefix} className="rise mx-auto block h-auto w-[104px]" />
          <p className="rise mt-2 text-center text-[12px] font-semibold uppercase tracking-[0.28em] text-[var(--page-muted)]" style={{ animationDelay: "60ms" }}>
            For {name}
            {content.occasion ? <span aria-hidden="true"> · </span> : null}
            {content.occasion ? <span>{content.occasion}</span> : null}
          </p>

          {/* The card that came out of the envelope, now as words on the page. */}
          <article
            className="card-in relative mt-5 rounded-[3px] px-7 pb-11 pt-11 text-center sm:px-12"
            style={{ ...paperStyle, boxShadow: "0 40px 80px -40px rgba(0,0,0,0.7), 0 10px 24px -14px rgba(0,0,0,0.4)" }}
          >
            <span aria-hidden="true" className="pointer-events-none absolute inset-[10px] rounded-[2px] border-2 border-[color-mix(in_srgb,var(--paper-accent)_55%,transparent)]" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-[16px] rounded-[1px] border border-[color-mix(in_srgb,var(--paper-accent)_45%,transparent)]" />

            {names ? (
              <p className="text-balance text-[44px] leading-[1.05] text-[var(--paper-accent)] sm:text-[54px]" style={formal}>
                {names}
              </p>
            ) : null}
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="mx-auto mt-4 max-w-[24ch] text-balance text-[24px] leading-snug outline-none sm:text-[27px]"
              style={{ ...displayStyle, fontStyle: script ? "normal" : "italic" }}
            >
              {content.headline}
            </h1>

            <Ornament className="mt-8 text-[var(--paper-accent)]" />
            {event && start && parts ? (
              <div>
                <p className="mt-7 text-[12px] font-semibold uppercase tracking-[0.3em] text-[var(--paper-muted)]">{parts.weekday}</p>
                <p className="mt-2 text-[30px] leading-tight" style={{ ...formal, fontVariantNumeric: "lining-nums" }}>
                  {parts.day} {parts.month} {parts.year}
                </p>
                <p className="mt-1 text-[17px] text-[var(--paper-muted)]">at {formatEventTime(start)}</p>
                <p className="mt-7 text-[24px] leading-tight" style={formal}>
                  {event.locationName}
                </p>
                {event.address ? <p className="mx-auto mt-1 max-w-[30ch] text-[15px] leading-relaxed text-[var(--paper-muted)]">{event.address}</p> : null}
              </div>
            ) : null}
          </article>

          {event ? (
            <div className="rise mt-8 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: "500ms" }}>
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
          ) : null}

          <section
            aria-label={`A note from ${content.senderName || "the hosts"}`}
            className="rise mt-6 rounded-[3px] px-6 pb-9 pt-8 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)] sm:px-8"
            style={{ ...paperStyle, animationDelay: "650ms" }}
          >
            <Paragraphs body={content.body} />
            <SignOff signOff={content.signOff} senderName={content.senderName} className="mt-8" />
          </section>

          <GiftList gifts={content.gifts} />
          {content.wishlist?.length ? <Wishlist items={content.wishlist} claimed={claimed} mood="elegant" hostName={content.senderName} /> : null}
          <MadeWith />
        </div>
      )}

      <style>{`
        .env-still { transition: opacity 600ms cubic-bezier(0.22, 0.61, 0.36, 1); }
        .env-words { transition: opacity 400ms ease-out; }
        .env-stage[data-live="true"] .env-still { opacity: 0; }
        .petal { display: none; }
        @media (prefers-reduced-motion: no-preference) {
          .env-stage[data-live="false"] .env-still-art { animation: env-idle 6s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
          .rise { animation: rise 900ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
          .card-in { animation: card-in 1100ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
          .petal { display: block; animation-name: petal-fall; animation-timing-function: linear; animation-fill-mode: both; animation-iteration-count: 1; }
        }
        @keyframes env-idle { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-6px) rotate(-0.8deg); } }
        @keyframes rise { from { opacity: 0; transform: translateY(14px); } }
        @keyframes card-in { from { opacity: 0; transform: translateY(70px) scale(0.92); } }
        @keyframes petal-fall {
          0% { transform: translate3d(0, -6vh, 0) rotate(0deg); opacity: 0; }
          8% { opacity: 0.9; }
          50% { transform: translate3d(28px, 50vh, 0) rotate(160deg); }
          90% { opacity: 0.85; }
          100% { transform: translate3d(-12px, 106vh, 0) rotate(320deg); opacity: 0; }
        }
      `}</style>
    </main>
  )
}
