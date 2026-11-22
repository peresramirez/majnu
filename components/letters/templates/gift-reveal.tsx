"use client"

// gift-reveal: a wrapped box with a ribbon and a name tag. Tapping it unties
// the bow, lifts the lid and brings out the gift card, then the note. The code
// is not on the page until the box is open.
import { useEffect, useRef, useState } from "react"
import type { LetterContent } from "@/lib/letters/schema"
import { displayStyle, focusRing, MadeWith, paperStyle, Stars } from "../chrome"
import { GiftCard } from "../gift-card"
import { useReducedMotion } from "../letter-context"
import { Paragraphs, SignOff } from "../letter-text"
import { wholeName } from "../names"
import { paletteOf } from "../theme"

type Stage = "wrapped" | "unwrapping" | "open"

function Bow() {
  return (
    <svg viewBox="0 0 120 92" className="h-full w-full overflow-visible" aria-hidden="true">
      <path d="M57 50 L41 86 L49 82 L53 92 L62 54 Z" style={{ fill: "color-mix(in srgb, var(--accent) 80%, #000)" }} />
      <path d="M63 50 L79 86 L71 82 L67 92 L58 54 Z" style={{ fill: "color-mix(in srgb, var(--accent) 86%, #000)" }} />
      <path d="M60 50 C42 14 6 12 8 36 C10 56 42 58 60 50 Z" style={{ fill: "var(--accent)" }} />
      <path d="M60 50 C78 14 114 12 112 36 C110 56 78 58 60 50 Z" style={{ fill: "var(--accent)" }} />
      <path d="M58 48 C44 26 22 24 20 36 C26 44 44 48 58 48 Z" style={{ fill: "color-mix(in srgb, var(--accent) 72%, #000)", opacity: 0.55 }} />
      <path d="M62 48 C76 26 98 24 100 36 C94 44 76 48 62 48 Z" style={{ fill: "color-mix(in srgb, var(--accent) 72%, #000)", opacity: 0.55 }} />
      <path d="M22 30 C30 22 42 24 50 34" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="60" cy="50" rx="10" ry="9" style={{ fill: "color-mix(in srgb, var(--accent) 88%, #000)" }} />
      <ellipse cx="57" cy="47" rx="4" ry="3" fill="rgba(255,255,255,0.3)" />
    </svg>
  )
}

const wrappingPaper = {
  backgroundColor: "var(--wrap)",
  backgroundImage:
    "repeating-linear-gradient(135deg, transparent 0 13px, color-mix(in srgb, var(--wrap-shade) 85%, transparent) 13px 26px), radial-gradient(circle at 50% 0%, rgba(255,255,255,0.18), transparent 70%)",
}

export function GiftReveal({ content }: { content: LetterContent }) {
  const [stage, setStage] = useState<Stage>("wrapped")
  const reduced = useReducedMotion()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const dark = paletteOf(content.theme).dark
  const name = wholeName(content.recipientName)
  const gifts = content.gifts ?? []

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => {
    if (stage === "open") headingRef.current?.focus({ preventScroll: true })
  }, [stage])

  function unwrap() {
    if (stage !== "wrapped") return
    if (reduced) {
      setStage("open")
      return
    }
    setStage("unwrapping")
    timers.current.push(setTimeout(() => setStage("open"), 1500))
  }

  return (
    <main className="relative min-h-[100svh] overflow-hidden" style={{ background: "var(--page)", color: "var(--page-ink)" }}>
      {dark ? <Stars /> : null}

      {stage !== "open" ? (
        <div className="flex min-h-[100svh] flex-col items-center justify-center px-5 py-12">
          <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[var(--page-muted)]">{content.occasion || "A gift"}</p>
          <h1 className="mt-3 text-center text-[34px] leading-tight" style={displayStyle}>
            For {name}
          </h1>

          <button
            type="button"
            onClick={unwrap}
            disabled={stage !== "wrapped"}
            aria-label={`Unwrap the gift from ${content.senderName}`}
            className={`gift group relative mt-14 h-[280px] w-[250px] rounded-3xl ${focusRing}`}
            data-stage={stage}
          >
            <span aria-hidden="true" className="gift-glow absolute inset-[-30%] rounded-full" />
            <span aria-hidden="true" className="absolute -bottom-5 left-[12%] right-[12%] h-7 rounded-[50%] bg-black/35 blur-xl" />

            {/* Box */}
            <span aria-hidden="true" className="gift-box absolute bottom-0 left-[14px] right-[14px] h-[176px] overflow-hidden rounded-[6px] shadow-[inset_0_-12px_24px_rgba(0,0,0,0.18)]" style={wrappingPaper}>
              <span className="gift-ribbon-v absolute inset-y-0 left-1/2 w-[30px] -translate-x-1/2" style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 85%, #000), var(--accent) 35%, var(--accent) 65%, color-mix(in srgb, var(--accent) 85%, #000))" }} />
              <span className="absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-black/25 to-transparent" />
            </span>

            {/* Lid with the bow */}
            <span aria-hidden="true" className="gift-lid absolute bottom-[168px] left-0 right-0 h-[54px]">
              <span className="absolute inset-0 rounded-[6px] shadow-[0_6px_10px_-4px_rgba(0,0,0,0.35)]" style={wrappingPaper} />
              <span className="gift-ribbon-v absolute inset-y-0 left-1/2 w-[30px] -translate-x-1/2" style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 85%, #000), var(--accent) 35%, var(--accent) 65%, color-mix(in srgb, var(--accent) 85%, #000))" }} />
              <span className="gift-bow absolute bottom-[32px] left-1/2 h-[107px] w-[140px] -translate-x-1/2">
                <Bow />
              </span>
            </span>

            {/* Name tag on a string */}
            <span aria-hidden="true" className="gift-tag absolute right-[-14px] top-[34px] origin-top-left rotate-[10deg]">
              <span className="absolute -left-7 -top-6 h-10 w-px rotate-[-40deg] bg-[var(--page-muted)] opacity-70" />
              <span className="block rounded-[4px] px-3 py-2 text-left shadow-md" style={paperStyle}>
                <span className="block text-[9px] font-semibold uppercase tracking-[0.25em] opacity-60">From</span>
                <span className="line-clamp-2 block max-w-[112px] break-words text-[16px] leading-[1.15]" style={displayStyle}>
                  {content.senderName}
                </span>
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={unwrap}
            disabled={stage !== "wrapped"}
            className={`mt-14 rounded-full bg-[var(--accent)] px-7 py-3.5 text-[15px] font-semibold text-[var(--accent-ink)] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)] transition-[opacity,transform] duration-300 ease-calm hover:-translate-y-px ${
              stage !== "wrapped" ? "opacity-0" : ""
            } ${focusRing}`}
          >
            Unwrap your gift
          </button>
        </div>
      ) : (
        <div className="relative mx-auto max-w-[480px] px-4 pb-12 pt-10 sm:pt-16">
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

          <article className="rise mt-8 rounded-[22px] px-6 pb-9 pt-8 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)]" style={{ ...paperStyle, animationDelay: "700ms" }}>
            <Paragraphs body={content.body} />
            <SignOff signOff={content.signOff} senderName={content.senderName} className="mt-8" />
          </article>

          <MadeWith />
        </div>
      )}

      <style>{`
        .gift-glow { background: radial-gradient(circle, color-mix(in srgb, var(--accent-soft) 55%, transparent) 0%, transparent 60%); opacity: 0.35; }
        .gift[data-stage="unwrapping"] .gift-bow { opacity: 0; transform: translate(-50%, -18px) scale(0.6); }
        .gift[data-stage="unwrapping"] .gift-ribbon-v { transform: translateX(-50%) scaleY(0); }
        .gift[data-stage="unwrapping"] .gift-lid { transform: translate(18px, -150px) rotate(14deg); opacity: 0; }
        .gift[data-stage="unwrapping"] .gift-tag { opacity: 0; }
        .gift[data-stage="unwrapping"] .gift-box { transform: translateY(40px) scale(0.96); opacity: 0; }
        .gift[data-stage="unwrapping"] .gift-glow { opacity: 1; transform: scale(1.25); }
        @media (prefers-reduced-motion: no-preference) {
          .gift { animation: gift-idle 6s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
          .gift[data-stage="unwrapping"] { animation: none; }
          .gift-bow { transition: opacity 300ms ease-out, transform 360ms cubic-bezier(0.22, 0.61, 0.36, 1); }
          .gift-ribbon-v { transition: transform 420ms cubic-bezier(0.22, 0.61, 0.36, 1) 180ms; transform-origin: 50% 0; }
          .gift-tag { transition: opacity 260ms ease-out; }
          .gift-lid { transition: transform 760ms cubic-bezier(0.22, 0.61, 0.36, 1) 420ms, opacity 520ms ease-out 620ms; }
          .gift-box { transition: transform 600ms cubic-bezier(0.22, 0.61, 0.36, 1) 820ms, opacity 500ms ease-out 880ms; }
          .gift-glow { transition: opacity 900ms ease-out 500ms, transform 1200ms cubic-bezier(0.22, 0.61, 0.36, 1) 500ms; }
          .gift:not(:disabled):hover .gift-lid { transform: translateY(-4px) rotate(-1.5deg); transition: transform 300ms cubic-bezier(0.22, 0.61, 0.36, 1); }
          .rise { animation: rise 900ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
          .card-in { animation: card-in 1000ms cubic-bezier(0.22, 0.61, 0.36, 1) 250ms both; }
        }
        @keyframes gift-idle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes rise { from { opacity: 0; transform: translateY(14px); } }
        @keyframes card-in { from { opacity: 0; transform: translateY(60px) scale(0.94); } }
      `}</style>
    </main>
  )
}
