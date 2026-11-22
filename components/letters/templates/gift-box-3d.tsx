"use client"

// gift-box-3d and party-box: a gift box in 3D, from the three.js prototype in
// docs/templates. Tapping it plays the reveal (mood "gift": the bow unties and
// the sides fold open; mood "party": the lid pops off in confetti and
// balloons) and a card with the recipient's name rises to face them. Then the
// page shows the gift card, the note and, for a party, when and where.
//
// three.js is never imported here. After mounting, and only when motion is
// allowed and the browser has WebGL, the scene module is fetched with
// import(), so the three.js chunk downloads for this template alone. Until it
// is ready, and whenever it cannot run, the page shows a still drawing of the
// box and the button opens the gift straight away. The code is not on the
// page until the box is open.
//
// A party box with a gift list (issue #52) shows it at the end; ./party-box.tsx
// renders it on the server with the claimed ids.
import { useCallback, useEffect, useId, useRef, useState } from "react"
import type { LetterContent, LetterEvent } from "@/lib/letters/schema"
import { displayStyle, focusRing, MadeWith, paperStyle, Stars } from "../chrome"
import { formatEventDate, formatEventTime, mapsUrl, parseEventStart } from "../event-time"
import { GiftCard } from "../gift-card"
import { useReducedMotion } from "../letter-context"
import { Paragraphs, SignOff } from "../letter-text"
import { wholeName } from "../names"
import { paletteOf } from "../theme"
import { Wishlist } from "../wishlist"
import { BoxDrawing } from "./gift-box-3d/drawing"
import { hasWebGL, type BoxMood } from "./gift-box-3d/layout"
// Types only: erased at build time, so this does not pull three.js in.
import type { BoxColors, BoxScene, CardText } from "./gift-box-3d/scene"

type Stage = "closed" | "opening" | "open"

// How long the card stays facing the visitor before the page takes over.
const HOLD_MS = 700

function readColors(el: HTMLElement): BoxColors {
  const s = getComputedStyle(el)
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback
  return {
    wrap: v("--wrap", "#33224A"),
    wrapShade: v("--wrap-shade", "#271A39"),
    accent: v("--accent", "#E2A98A"),
    accentSoft: v("--accent-soft", "#CD8DBD"),
    paper: v("--paper", "#F7F0E6"),
    paperInk: v("--paper-ink", "#2A1C3A"),
    paperMuted: v("--paper-muted", "#6E5A78"),
    paperAccent: v("--paper-accent", "#B9775A"),
  }
}

function readCard(el: HTMLElement, content: LetterContent, mood: BoxMood): CardText {
  const s = getComputedStyle(el)
  return {
    eyebrow: content.occasion || (mood === "party" ? "Surprise" : "A gift"),
    title: `For ${wholeName(content.recipientName)}`,
    headline: content.headline ?? "",
    from: content.senderName ? `from ${content.senderName}` : "",
    // Custom properties compute with their var() references resolved, so these
    // are the real next/font family names the page itself uses.
    displayFont: s.getPropertyValue("--display").trim() || "Georgia, serif",
    displayWeight: s.getPropertyValue("--display-weight").trim() || "500",
    bodyFont: s.getPropertyValue("--body").trim() || "system-ui, sans-serif",
    script: content.theme?.font === "script",
  }
}

function EventDetails({ event }: { event: LetterEvent }) {
  const start = parseEventStart(event.startsAt)
  return (
    <section aria-label="When and where" className="rise mt-6 rounded-[22px] px-6 py-6 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)]" style={{ ...paperStyle, animationDelay: "500ms" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--paper-muted)]">The party</p>
      <p className="mt-1 text-[26px] leading-tight" style={displayStyle}>
        {event.title}
      </p>
      {start ? (
        <p className="mt-3 text-[16px] font-semibold" style={{ fontVariantNumeric: "lining-nums" }}>
          {formatEventDate(start)}, {formatEventTime(start)}
        </p>
      ) : null}
      <p className="mt-1 text-[16px]">{event.locationName}</p>
      {event.address ? <p className="text-[14px] text-[var(--paper-muted)]">{event.address}</p> : null}
      <a
        href={mapsUrl(event.locationName, event.address)}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-semibold text-[var(--deep-ink)] ${focusRing}`}
        style={{ background: "var(--deep)" }}
      >
        Open in Maps
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4">
          <path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </section>
  )
}

// A little confetti that has already landed, above the party box's note.
const LANDED: [number, number, number, string][] = [
  [8, 6, 24, "var(--accent)"],
  [22, 2, -18, "#f6c453"],
  [37, 9, 50, "var(--accent-soft)"],
  [55, 3, -36, "var(--paper-accent)"],
  [68, 8, 12, "var(--accent)"],
  [83, 4, -50, "#f6c453"],
  [93, 10, 30, "var(--accent-soft)"],
]

// `claimed`: the party box's gift list, claimed ids read on the server.
export function GiftBox3D({ content, mood, claimed }: { content: LetterContent; mood: BoxMood; claimed?: string[] }) {
  const [stage, setStage] = useState<Stage>("closed")
  // True once the 3D scene is drawing over the still picture.
  const [live, setLive] = useState(false)
  const reduced = useReducedMotion()
  const idPrefix = useId().replace(/:/g, "")
  const stageRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const sceneRef = useRef<BoxScene | null>(null)
  const stageNow = useRef<Stage>("closed")
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const dark = paletteOf(content.theme).dark
  const name = wholeName(content.recipientName)
  const gifts = content.gifts ?? []
  const party = mood === "party"

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
      // Whatever went wrong in the scene, the gift still opens.
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
    let created: BoxScene | null = null
    const stop = () => {
      created?.dispose()
      created = null
      sceneRef.current = null
      setLive(false)
    }
    import("./gift-box-3d/scene")
      .then(({ createBoxScene }) =>
        cancelled
          ? null
          : createBoxScene(el, {
              mood,
              colors: readColors(el),
              card: readCard(el, content, mood),
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
  }, [mood, content, go])

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
      {dark ? <Stars /> : null}

      {stage !== "open" ? (
        <div className="relative min-h-[100svh]">
          {/* The scene fills the first screen, as in the prototype, so confetti
              and balloons never meet an edge. The words sit on top of it. */}
          <div
            ref={stageRef}
            aria-hidden="true"
            onClick={() => void open()}
            className="box-stage absolute inset-0 cursor-pointer"
            data-live={live ? "true" : "false"}
          >
            <span className="box-still absolute inset-x-0 top-[59%] flex -translate-y-1/2 justify-center">
              <BoxDrawing mood={mood} idPrefix={idPrefix} className="box-still-art h-auto w-[min(66vw,56svh)]" />
            </span>
          </div>

          <div className="pointer-events-none relative flex min-h-[100svh] flex-col items-center justify-between px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-14 sm:pt-16">
            <div className={`box-words text-center ${stage !== "closed" ? "opacity-0" : ""}`}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[var(--page-muted)]">{content.occasion || (party ? "Surprise" : "A gift")}</p>
              <h1 className="mt-3 text-balance text-[34px] leading-tight sm:text-[40px]" style={displayStyle}>
                For {name}
              </h1>
            </div>

            <button
              type="button"
              onClick={() => void open()}
              disabled={stage !== "closed"}
              aria-label={`${party ? "Pop open" : "Open"} the gift${content.senderName?.trim() ? ` from ${content.senderName}` : ""}`}
              className={`pointer-events-auto rounded-full bg-[var(--accent)] px-7 py-3.5 text-[15px] font-semibold text-[var(--accent-ink)] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)] transition-[opacity,transform] duration-300 ease-calm hover:-translate-y-px ${
                stage !== "closed" ? "opacity-0" : ""
              } ${focusRing}`}
            >
              {party ? "Pop it open" : "Open your gift"}
            </button>
          </div>
        </div>
      ) : (
        <div className="relative mx-auto max-w-[480px] px-4 pb-12 pt-10 sm:pt-16">
          {party ? (
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-16">
              {LANDED.map(([x, y, r, color], i) => (
                <span
                  key={i}
                  className="landed absolute h-[7px] w-[12px] rounded-[2px]"
                  style={{ left: `${x}%`, top: `${y * 4}px`, background: color, transform: `rotate(${r}deg)`, animationDelay: `${i * 60}ms` }}
                />
              ))}
            </div>
          ) : null}
          <p className="rise text-center text-[12px] font-semibold uppercase tracking-[0.28em] text-[var(--page-muted)]">
            For {name}
            {content.occasion ? <span aria-hidden="true"> · </span> : null}
            {content.occasion ? <span>{content.occasion}</span> : null}
          </p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="rise mt-3 text-balance text-center text-[38px] leading-[1.06] tracking-[-0.01em] outline-none sm:text-[46px]"
            style={{ ...displayStyle, animationDelay: "80ms" }}
          >
            {content.headline}
          </h1>

          {gifts.length ? (
            <div className="card-in mt-8 space-y-5">
              {gifts.map((g, i) => (
                <GiftCard key={i} gift={g} codeShown eyebrow={gifts.length > 1 ? `Gift ${i + 1} of ${gifts.length}` : "Your gift"} />
              ))}
            </div>
          ) : null}

          {party && content.event ? <EventDetails event={content.event} /> : null}

          <article className="rise mt-6 rounded-[22px] px-6 pb-9 pt-8 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)]" style={{ ...paperStyle, animationDelay: "700ms" }}>
            <Paragraphs body={content.body} />
            <SignOff signOff={content.signOff} senderName={content.senderName} className="mt-8" />
          </article>

          {party && content.wishlist?.length ? <Wishlist items={content.wishlist} claimed={claimed} mood="playful" hostName={content.senderName} /> : null}
          <MadeWith />
        </div>
      )}

      <style>{`
        .box-still { transition: opacity 600ms cubic-bezier(0.22, 0.61, 0.36, 1); }
        .box-words { transition: opacity 400ms ease-out; }
        .box-stage[data-live="true"] .box-still { opacity: 0; }
        @media (prefers-reduced-motion: no-preference) {
          .box-stage[data-live="false"] .box-still-art { animation: box-idle 5s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
          .rise { animation: rise 900ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
          .card-in { animation: card-in 1000ms cubic-bezier(0.22, 0.61, 0.36, 1) 250ms both; }
          .landed { animation: landed 900ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
        }
        @keyframes box-idle { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-6px) rotate(-1deg); } }
        @keyframes rise { from { opacity: 0; transform: translateY(14px); } }
        @keyframes card-in { from { opacity: 0; transform: translateY(60px) scale(0.94); } }
        @keyframes landed { from { opacity: 0; translate: 0 -40px; } }
      `}</style>
    </main>
  )
}
