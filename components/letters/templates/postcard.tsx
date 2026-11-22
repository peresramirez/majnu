"use client"

// postcard: a picture side with the headline over a little painted landscape,
// and a written side with the message, a perforated stamp and a postmark.
// Tap the card, or use the "Turn over" button (the keyboard's way in), to flip
// it. The side facing away is inert, so it is neither focusable nor read out.
// With reduced motion nothing flips: both sides are shown, one above the other.
import { useId, useState } from "react"
import type { LetterContent } from "@/lib/letters/schema"
import { displayStyle, focusRing, MadeWith, paperStyle, Stars } from "../chrome"
import { GiftList } from "../gift-card"
import { useReducedMotion } from "../letter-context"
import { Paragraphs, SignOff } from "../letter-text"
import { wholeName } from "../names"
import { paletteOf } from "../theme"

function Landscape({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 200" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden="true">
      <circle cx="212" cy="78" r="34" style={{ fill: "var(--accent-soft)" }} />
      <circle cx="212" cy="78" r="48" fill="none" strokeWidth="1.5" style={{ stroke: "var(--accent-soft)" }} opacity="0.6" />
      <path d="M0 132 C 50 104, 96 108, 150 126 S 250 112, 300 98 L300 200 L0 200 Z" style={{ fill: "var(--wrap)" }} />
      <path d="M0 152 C 60 132, 120 140, 170 154 S 260 142, 300 136 L300 200 L0 200 Z" style={{ fill: "var(--wrap-shade)" }} />
      <path d="M0 174 C 70 160, 140 168, 200 178 S 270 170, 300 166 L300 200 L0 200 Z" style={{ fill: "var(--paper-accent)" }} opacity="0.85" />
    </svg>
  )
}

function Postmark({ label }: { label: string }) {
  const id = useId().replace(/:/g, "")
  const text = (label || "With love").toUpperCase().slice(0, 22)
  return (
    <svg viewBox="0 0 150 80" className="h-[64px] w-[120px] text-[var(--paper-ink)]" aria-hidden="true">
      <defs>
        <path id={`pm-${id}`} d="M 72 40 m -27 0 a 27 27 0 1 1 54 0 a 27 27 0 1 1 -54 0" />
      </defs>
      <g fill="none" stroke="currentColor" strokeOpacity="0.38" strokeWidth="1.4">
        <circle cx="72" cy="40" r="34" />
        <circle cx="72" cy="40" r="20" />
        <path d="M0 22 q 6 -5 12 0 t 12 0 t 12 0 M0 40 q 6 -5 12 0 t 12 0 t 12 0 M0 58 q 6 -5 12 0 t 12 0 t 12 0" />
        <path d="M108 22 q 6 -5 12 0 t 12 0 t 12 0 M108 40 q 6 -5 12 0 t 12 0 t 12 0 M108 58 q 6 -5 12 0 t 12 0 t 12 0" />
      </g>
      <text fontSize="8.5" letterSpacing="2" fill="currentColor" fillOpacity="0.5" fontFamily="system-ui, sans-serif" fontWeight="600">
        <textPath href={`#pm-${id}`}>{text}</textPath>
      </text>
      <path d="M64 41 l5 5 l10 -11" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Stamp() {
  return (
    <div className="postcard-stamp h-[84px] w-[70px] shrink-0 rotate-[3deg] bg-[var(--paper)] shadow-[0_2px_4px_rgba(0,0,0,0.18)]">
      <div className="relative h-full w-full overflow-hidden" style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 28%, var(--paper)) 0%, var(--paper) 100%)" }}>
        <Landscape className="absolute inset-0 h-full w-full" />
      </div>
    </div>
  )
}

export function Postcard({ content }: { content: LetterContent }) {
  const [flipped, setFlipped] = useState(false)
  // Stacked: both sides visible at once (the layout itself comes from CSS, so
  // it is right before this hook runs in the browser).
  const stacked = useReducedMotion()
  const dark = paletteOf(content.theme).dark
  const name = wholeName(content.recipientName)

  return (
    <main className="relative min-h-[100svh] overflow-hidden" style={{ background: "var(--page)", color: "var(--page-ink)" }}>
      {dark ? <Stars /> : null}
      <div className="relative mx-auto flex min-h-[100svh] max-w-[720px] flex-col items-center justify-center px-4 pb-12 pt-10">
        <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[var(--page-muted)]">A postcard for {name}</p>

        <div className="postcard-scene mt-6 w-full max-w-[400px] sm:max-w-[640px]">
          <div
            className="postcard relative aspect-[3/4] w-full cursor-pointer touch-manipulation sm:aspect-[3/2]"
            data-flipped={flipped}
            onClick={() => {
              if (!stacked) setFlipped((f) => !f)
            }}
          >
            {/* Picture side */}
            <div
              className="postcard-face absolute inset-0 overflow-hidden rounded-[6px] p-[10px] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6),0_8px_20px_-12px_rgba(0,0,0,0.35)]"
              style={{ background: "var(--paper)" }}
              inert={!stacked && flipped}
            >
              <div
                className="relative h-full w-full overflow-hidden rounded-[2px]"
                style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 28%, var(--paper)) 0%, var(--paper) 70%)" }}
              >
                {/* Taller on the wide card, so the sun is not cut off at the top */}
                <Landscape className="absolute inset-x-0 bottom-0 h-[62%] w-full sm:h-[88%]" />
                <div className="relative p-6 sm:p-8">
                  <h1 className="max-w-[11ch] text-balance text-[44px] leading-[0.98] tracking-[-0.01em] text-[var(--paper-ink)] sm:text-[56px]" style={displayStyle}>
                    {content.headline}
                  </h1>
                </div>
                <p className="absolute bottom-4 left-5 text-[11px] font-semibold uppercase tracking-[0.26em] opacity-90" style={{ color: "var(--paper)" }}>
                  {content.occasion}
                </p>
              </div>
            </div>

            {/* Written side */}
            <div
              className="postcard-face postcard-back absolute inset-0 overflow-hidden rounded-[6px] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6),0_8px_20px_-12px_rgba(0,0,0,0.35)]"
              style={paperStyle}
              inert={!stacked && !flipped}
            >
              <div className="flex h-full flex-col p-5 sm:grid sm:grid-cols-[1.25fr_1fr] sm:gap-0 sm:p-7">
                <div className="flex items-start justify-between gap-3 sm:order-2 sm:col-start-2 sm:row-start-1 sm:pl-6">
                  <div className="-ml-2">
                    <Postmark label={content.occasion} />
                  </div>
                  <Stamp />
                </div>

                <div className="postcard-message mt-3 min-h-0 flex-1 overflow-y-auto pr-1 sm:order-1 sm:col-start-1 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:border-r sm:border-[var(--line)] sm:pr-6">
                  <Paragraphs body={content.body} />
                  <SignOff signOff={content.signOff} senderName={content.senderName} className="mt-5" />
                </div>

                <div className="mt-4 border-t border-[var(--line)] pt-3 sm:order-3 sm:col-start-2 sm:row-start-2 sm:mt-0 sm:self-end sm:border-t-0 sm:pl-6 sm:pt-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--paper-muted)]">To</p>
                  <p className="text-[30px] leading-tight" style={displayStyle}>
                    {content.recipientName}
                  </p>
                  <span aria-hidden="true" className="mt-3 hidden h-px w-full bg-[var(--line)] sm:block" />
                  <span aria-hidden="true" className="mt-5 hidden h-px w-full bg-[var(--line)] sm:block" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {stacked ? null : (
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className={`postcard-turn mt-8 inline-flex items-center gap-2 rounded-full border px-5 py-3 text-[15px] font-medium transition-colors duration-200 ${focusRing}`}
            style={{ borderColor: "color-mix(in srgb, var(--page-ink) 30%, transparent)" }}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
              <path d="M4 10a6 6 0 0 1 10.5-4M16 10a6 6 0 0 1-10.5 4M14.5 2.5V6H11M5.5 17.5V14H9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {flipped ? "Turn back" : "Turn over"}
          </button>
        )}

        <GiftList gifts={content.gifts} />
        <MadeWith />
      </div>

      <style>{`
        .postcard-scene { perspective: 1600px; }
        .postcard { transform-style: preserve-3d; }
        .postcard-face { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .postcard-back { transform: rotateY(180deg); }
        .postcard[data-flipped="true"] { transform: rotateY(180deg); }
        .postcard-stamp {
          padding: 5px;
          -webkit-mask: linear-gradient(#000 0 0) content-box, radial-gradient(circle 3px at 50% 50%, #0000 95%, #000) -4px -4px / 8px 8px;
                  mask: linear-gradient(#000 0 0) content-box, radial-gradient(circle 3px at 50% 50%, #0000 95%, #000) -4px -4px / 8px 8px;
        }
        @media (prefers-reduced-motion: no-preference) {
          .postcard { transition: transform 1000ms cubic-bezier(0.22, 0.61, 0.36, 1); animation: postcard-peek 1400ms cubic-bezier(0.22, 0.61, 0.36, 1) 900ms 1 both; }
          .postcard[data-flipped="true"] { animation: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          /* Both sides, picture first, nothing to flip. */
          .postcard, .postcard[data-flipped="true"] { transform: none; aspect-ratio: auto; display: flex; flex-direction: column; gap: 20px; cursor: default; }
          .postcard .postcard-face { position: relative; inset: auto; transform: none; aspect-ratio: 3 / 4; }
          .postcard-turn { display: none; }
        }
        @media (prefers-reduced-motion: reduce) and (min-width: 640px) {
          .postcard .postcard-face { aspect-ratio: 3 / 2; }
        }
        @keyframes postcard-peek { 0%, 100% { transform: rotateY(0); } 45% { transform: rotateY(-14deg); } }
      `}</style>
    </main>
  )
}
