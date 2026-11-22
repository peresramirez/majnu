"use client"

// classic-envelope: a sealed envelope with a wax seal. Tapping the seal breaks
// it, the flap lifts, the letter slides out, and then it opens flat to read.
import { useEffect, useId, useRef, useState } from "react"
import type { LetterContent } from "@/lib/letters/schema"
import { displayStyle, focusRing, MadeWith, Ornament, paperStyle, Stars } from "../chrome"
import { GiftList } from "../gift-card"
import { useReducedMotion } from "../letter-context"
import { Paragraphs, SignOff } from "../letter-text"
import { wholeName } from "../names"
import { paletteOf } from "../theme"
import { VoiceNoteSlot } from "../voice-player"

type Stage = "sealed" | "opening" | "open" | "done"

// The irregular edge of a wax seal, smoothed through midpoints. Computed once,
// identically on the server and in the browser.
const WAX_PATH = (() => {
  const wobble = [0, 2.4, -1.2, 1.8, -2.2, 1, 2.6, -1.6, 0.8, -2.4, 1.6, -0.8, 2.2, -1.4, 1.2, -2.6, 0.6, 1.4]
  const n = wobble.length
  const pts = wobble.map((w, i) => {
    const a = (i / n) * Math.PI * 2
    return [50 + (44 + w) * Math.cos(a), 50 + (44 + w) * Math.sin(a)]
  })
  const mid = (i: number) => {
    const p = pts[i % n]
    const q = pts[(i + 1) % n]
    return `${((p[0] + q[0]) / 2).toFixed(2)} ${((p[1] + q[1]) / 2).toFixed(2)}`
  }
  let d = `M${mid(0)}`
  for (let i = 1; i <= n; i++) d += ` Q${pts[i % n][0].toFixed(2)} ${pts[i % n][1].toFixed(2)} ${mid(i)}`
  return `${d}Z`
})()

export function WaxSeal({ initial, className = "" }: { initial: string; className?: string }) {
  const id = useId().replace(/:/g, "")
  return (
    <span className={`relative block ${className}`}>
      <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]" aria-hidden="true">
        <defs>
          <radialGradient id={`wax-${id}`} cx="36%" cy="30%" r="78%">
            <stop offset="0%" style={{ stopColor: "color-mix(in srgb, var(--accent) 70%, #fff)" }} />
            <stop offset="45%" style={{ stopColor: "var(--accent)" }} />
            <stop offset="100%" style={{ stopColor: "color-mix(in srgb, var(--accent) 62%, #000)" }} />
          </radialGradient>
        </defs>
        <path d={WAX_PATH} fill={`url(#wax-${id})`} />
        <circle cx="50" cy="50" r="31" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="2.4" />
        <circle cx="49.4" cy="49.4" r="31" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
      </svg>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center text-[28px] leading-none"
        style={{
          ...displayStyle,
          color: "color-mix(in srgb, var(--accent) 55%, #000)",
          textShadow: "0 1px 0 color-mix(in srgb, var(--accent) 60%, #fff)",
        }}
      >
        {initial}
      </span>
    </span>
  )
}

export function ClassicEnvelope({ content }: { content: LetterContent }) {
  const [stage, setStage] = useState<Stage>("sealed")
  const reduced = useReducedMotion()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const dark = paletteOf(content.theme).dark
  const name = wholeName(content.recipientName)
  const initial = Array.from((content.senderName ?? "").trim())[0]?.toUpperCase() ?? "M"

  const reading = stage === "open" || stage === "done"

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // Move to the letter once it is out, so keyboards and screen readers follow.
  useEffect(() => {
    if (reading) headingRef.current?.focus({ preventScroll: true })
  }, [reading])

  function open() {
    if (stage !== "sealed") return
    if (reduced) {
      setStage("done")
      return
    }
    setStage("opening")
    timers.current.push(setTimeout(() => setStage("open"), 1900))
    timers.current.push(setTimeout(() => setStage("done"), 2500))
  }

  return (
    <main
      className="relative min-h-[100svh] overflow-hidden"
      style={{ background: "var(--page)", color: "var(--page-ink)" }}
    >
      {dark ? <Stars /> : null}

      {stage !== "done" ? (
        <div
          className={`absolute inset-x-0 top-0 flex h-[100svh] flex-col items-center justify-center px-5 transition-opacity duration-500 ease-calm ${
            reading ? "pointer-events-none opacity-0" : ""
          }`}
          aria-hidden={reading}
        >
          <p className="mb-10 text-[12px] font-semibold uppercase tracking-[0.28em] text-[var(--page-muted)]">
            {content.occasion || "A letter"}
          </p>

          <div className="env-float relative w-full max-w-[380px]">
            <div className="env-shadow absolute -bottom-6 left-[8%] right-[8%] h-8 rounded-[50%] bg-black/40 blur-xl" aria-hidden="true" />
            <div className="env relative w-full" data-stage={stage} style={{ aspectRatio: "1.5" }}>
              {/* Inside of the envelope */}
              <div className="absolute inset-0 rounded-[6px] env-liner" style={{ zIndex: 0 }} />

              {/* The letter, folded inside */}
              <div className="env-letter absolute inset-x-[6%] bottom-[5%] top-[7%] rounded-[3px] px-5 pt-5 shadow-sm" style={{ ...paperStyle, zIndex: 2 }}>
                <p className="truncate text-[20px] leading-tight" style={displayStyle}>
                  {content.headline}
                </p>
                <div className="mt-3 space-y-2" aria-hidden="true">
                  <span className="block h-[3px] w-[92%] rounded bg-[var(--line)]" />
                  <span className="block h-[3px] w-[84%] rounded bg-[var(--line)]" />
                  <span className="block h-[3px] w-[88%] rounded bg-[var(--line)]" />
                  <span className="block h-[3px] w-[60%] rounded bg-[var(--line)]" />
                </div>
              </div>

              {/* Front pocket with its folds */}
              <div className="absolute inset-0" style={{ zIndex: 3 }}>
                <div
                  className="absolute inset-0 rounded-[6px]"
                  style={{ background: "var(--wrap-shade)", clipPath: "polygon(0 0, 50% 47%, 100% 0, 100% 100%, 0 100%)" }}
                />
                <div className="absolute inset-0 drop-shadow-[0_-2px_3px_rgba(0,0,0,0.14)]">
                  <div
                    className="absolute inset-0 rounded-b-[6px]"
                    style={{
                      background: "linear-gradient(180deg, color-mix(in srgb, var(--wrap) 92%, #fff) 0%, var(--wrap) 60%)",
                      clipPath: "polygon(0 100%, 50% 43%, 100% 100%)",
                    }}
                  />
                </div>
                <div className="env-name absolute inset-x-0 bottom-[7%] text-center text-[var(--wrap-ink)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] opacity-70">For</p>
                  <p className="mt-0.5 text-[30px] leading-none" style={displayStyle}>
                    {name}
                  </p>
                </div>
              </div>

              {/* Top flap: outside face, and the lined inside seen once it lifts */}
              <div className="env-flap absolute inset-x-0 top-0 h-[51%]">
                <div
                  className="env-face absolute inset-0"
                  style={{
                    background: "linear-gradient(180deg, var(--wrap) 0%, color-mix(in srgb, var(--wrap) 88%, #000) 100%)",
                    clipPath: "polygon(0 0, 100% 0, 50% 100%)",
                  }}
                />
                <div className="env-face env-face-back env-liner absolute inset-0" style={{ clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }} />
              </div>

              {/* The seal is the button */}
              <button
                type="button"
                onClick={open}
                disabled={stage !== "sealed"}
                aria-label={content.senderName?.trim() ? `Open the letter from ${content.senderName}` : "Open the letter"}
                className={`env-seal absolute left-1/2 top-[48%] h-[70px] w-[70px] -translate-x-1/2 -translate-y-1/2 rounded-full ${focusRing}`}
                style={{ zIndex: 5 }}
              >
                <WaxSeal initial={initial} className="h-full w-full" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={open}
            disabled={stage !== "sealed"}
            className={`mt-12 rounded-full px-4 py-2 text-[15px] text-[var(--page-muted)] transition-opacity duration-300 ${stage !== "sealed" ? "opacity-0" : ""} ${focusRing}`}
          >
            Tap the seal to open
          </button>
        </div>
      ) : null}

      {reading ? (
        <div className="relative mx-auto max-w-[620px] px-4 pb-12 pt-10 sm:pt-16">
          <p className="rise text-center text-[12px] font-semibold uppercase tracking-[0.28em] text-[var(--page-muted)]">
            For {name}
            {content.occasion ? <span aria-hidden="true"> · </span> : null}
            {content.occasion ? <span>{content.occasion}</span> : null}
          </p>

          <article className="letter-sheet relative mt-6 rounded-[3px] px-6 pb-12 pt-11 sm:px-14 sm:pb-16 sm:pt-16" style={paperStyle}>
            {/* The two folds of a letter that was in an envelope */}
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-gradient-to-r from-transparent via-[var(--line)] to-transparent" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-gradient-to-r from-transparent via-[var(--line)] to-transparent" />

            <h1
              ref={headingRef}
              tabIndex={-1}
              className="rise text-balance text-[40px] leading-[1.04] tracking-[-0.01em] outline-none sm:text-[52px]"
              style={{ ...displayStyle, animationDelay: "120ms" }}
            >
              {content.headline}
            </h1>
            <Ornament align="start" className="rise my-8 text-[var(--paper-accent)]" />
            {/* The sender's voice, clipped to the top of the letter. */}
            <VoiceNoteSlot tone="paper" className="rise mb-9" style={{ animationDelay: "200ms" }} />
            <Paragraphs body={content.body} stagger />
            <SignOff
              signOff={content.signOff}
              senderName={content.senderName}
              className="rise mt-12"
            />
          </article>

          <GiftList gifts={content.gifts} title="Inside the envelope" />
          <MadeWith />
        </div>
      ) : null}

      <style>{`
        .env { perspective: 1400px; }
        .env-liner {
          background-color: var(--wrap-shade);
          background-image: radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--accent-soft) 55%, transparent) 1px, transparent 1.6px);
          background-size: 9px 9px;
        }
        .env-flap { transform-origin: 50% 0; transform-style: preserve-3d; z-index: 4; }
        .env-face { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .env-face-back { transform: rotateX(180deg); }
        .env[data-stage="opening"] .env-flap, .env[data-stage="open"] .env-flap { transform: rotateX(180deg); z-index: 1; }
        .env[data-stage="opening"] .env-letter, .env[data-stage="open"] .env-letter { transform: translateY(-44%); }
        .env:not([data-stage="sealed"]) .env-seal { opacity: 0; transform: translate(-50%, -50%) scale(0.82); }
        .env:not([data-stage="sealed"]) .env-name { opacity: 0; }
        .letter-sheet { box-shadow: 0 1px 0 rgba(255,255,255,0.4) inset, 0 30px 70px -30px rgba(0,0,0,0.55), 0 8px 20px -12px rgba(0,0,0,0.3); }
        @media (prefers-reduced-motion: no-preference) {
          .env-float { animation: env-float 7s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
          .env-flap { transition: transform 820ms cubic-bezier(0.22, 0.61, 0.36, 1) 260ms, z-index 0s linear 680ms; }
          .env-letter { transition: transform 1000ms cubic-bezier(0.22, 0.61, 0.36, 1) 980ms; }
          .env-seal { transition: opacity 280ms ease-out, transform 280ms ease-out; }
          .env-name { transition: opacity 300ms ease-out; }
          .env-seal:not(:disabled):hover { transform: translate(-50%, -50%) scale(1.04); transition: transform 250ms cubic-bezier(0.22, 0.61, 0.36, 1); }
          .rise { animation: rise 900ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
          .letter-sheet { animation: sheet-in 1000ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
        }
        @keyframes env-float { 0%, 100% { transform: translateY(0) rotate(-1.5deg); } 50% { transform: translateY(-6px) rotate(-1deg); } }
        @keyframes rise { from { opacity: 0; transform: translateY(14px); } }
        @keyframes sheet-in { from { opacity: 0; transform: translateY(40px) scale(0.98); } }
      `}</style>
    </main>
  )
}
