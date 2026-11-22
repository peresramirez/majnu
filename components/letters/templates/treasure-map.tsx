"use client"

// treasure-map: a folded map on old paper, sealed with wax, after the
// parchment design example in docs/templates/example-i-want-just-for-design.
// Breaking the seal swings the two halves of the map open; inside is the
// letter, inked over a faint map whose dotted path ends at an X with the
// recipient's name. CSS and SVG only: nothing to download, and with reduced
// motion the seal opens the letter at once.
import { useEffect, useRef, useState } from "react"
import type { LetterContent } from "@/lib/letters/schema"
import { displayStyle, focusRing, MadeWith, Ornament } from "../chrome"
import { GiftList } from "../gift-card"
import { useReducedMotion } from "../letter-context"
import { Paragraphs, SignOff } from "../letter-text"
import { firstName, monogram } from "../names"
import { Compass, parchment } from "./treasure-map/parts"

type Stage = "sealed" | "unfolding" | "open"

const ink = "var(--paper-ink)"

// Hills, waves and a small wood, drawn in ink around the edges of the letter.
function MapDoodles() {
  return (
    <svg viewBox="0 0 400 800" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <g fill="none" stroke={ink} strokeWidth="1.1" vectorEffect="non-scaling-stroke" opacity="0.32" strokeLinecap="round">
        <path d="M18 250 l14 -20 l14 20 M38 252 l10 -14 l10 14" vectorEffect="non-scaling-stroke" />
        <path d="M352 420 l12 -18 l12 18 M368 424 l9 -12 l9 12" vectorEffect="non-scaling-stroke" />
        <path d="M14 560 q8 -6 16 0 t16 0 t16 0 M20 572 q8 -6 16 0 t16 0" vectorEffect="non-scaling-stroke" />
        <path d="M330 150 q8 -6 16 0 t16 0 t16 0 M336 162 q8 -6 16 0 t16 0" vectorEffect="non-scaling-stroke" />
        <path d="M360 640 v14 M354 646 l6 -10 l6 10 M374 650 v12 M369 655 l5 -9 l5 9" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  )
}

// The dotted path from the top of the map to the X beside the sign-off.
function TrailPath({ drawn }: { drawn: boolean }) {
  return (
    <svg
      viewBox="0 0 400 800"
      preserveAspectRatio="none"
      className="trail pointer-events-none absolute inset-0 h-full w-full"
      data-drawn={drawn ? "true" : "false"}
      aria-hidden="true"
    >
      <path
        d="M40 70 C 120 40, 210 120, 330 90 S 390 220, 300 290 S 40 330, 60 450 S 330 520, 340 600 S 290 712, 356 752"
        fill="none"
        style={{ stroke: "var(--paper-accent)" }}
        strokeWidth="2"
        strokeDasharray="2 7"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.45"
      />
    </svg>
  )
}

function WaxSeal({ initial, cracked }: { initial: string; cracked: boolean }) {
  const half = (side: "l" | "r") => (
    <span
      className={`seal-half seal-${side} absolute inset-0 flex items-center justify-center rounded-full`}
      style={{
        background:
          "radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--paper-accent) 62%, #fff) 0%, var(--paper-accent) 48%, color-mix(in srgb, var(--paper-accent) 55%, #000) 100%)",
        boxShadow: "inset 0 -3px 8px rgba(0,0,0,0.35), inset 0 3px 6px rgba(255,255,255,0.18)",
        clipPath: side === "l" ? "polygon(0 0, 54% 0, 44% 38%, 56% 62%, 46% 100%, 0 100%)" : "polygon(54% 0, 100% 0, 100% 100%, 46% 100%, 56% 62%, 44% 38%)",
      }}
    >
      <span
        className="text-[26px] leading-none"
        style={{ ...displayStyle, color: "color-mix(in srgb, var(--paper-accent) 30%, #fff)", textShadow: "0 -1px 0 rgba(0,0,0,0.35)" }}
      >
        {initial}
      </span>
    </span>
  )
  return (
    <span className="seal relative block h-[74px] w-[74px] rounded-full" data-cracked={cracked ? "true" : "false"} aria-hidden="true">
      {half("l")}
      {half("r")}
    </span>
  )
}

export function TreasureMap({ content }: { content: LetterContent }) {
  const [stage, setStage] = useState<Stage>("sealed")
  const reduced = useReducedMotion()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const name = firstName(content.recipientName)
  const initial = monogram(content.senderName).split(" ")[0]

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => {
    if (stage === "open") headingRef.current?.focus({ preventScroll: true })
  }, [stage])

  function breakSeal() {
    if (stage !== "sealed") return
    if (reduced) {
      setStage("open")
      return
    }
    setStage("unfolding")
    timers.current.push(setTimeout(() => setStage("open"), 1500))
  }

  return (
    <main className="relative min-h-[100svh] overflow-hidden" style={{ background: "var(--page)", color: "var(--page-ink)" }}>
      {stage !== "open" ? (
        <div className="flex min-h-[100svh] flex-col items-center justify-center px-5 py-10">
          <div className="folded relative h-[min(560px,74svh)] min-h-[420px] w-[min(340px,86vw)]" data-stage={stage}>
            {/* Inside, glimpsed as the halves open */}
            <div className="inside absolute inset-0 overflow-hidden rounded-[3px]" style={parchment} aria-hidden="true">
              <TrailPath drawn />
              <Compass className="absolute right-6 top-6 h-14 w-14" />
            </div>

            <div className="flap flap-l absolute left-0 top-0 h-full w-1/2 rounded-l-[3px]" style={parchment} aria-hidden="true" />
            <div className="flap flap-r absolute right-0 top-0 h-full w-1/2 rounded-r-[3px]" style={parchment} aria-hidden="true" />

            {/* The cover */}
            <div className="face absolute inset-0 flex flex-col items-center justify-center px-7 text-center text-[var(--paper-ink)]">
              <svg viewBox="0 0 100 180" preserveAspectRatio="none" className="pointer-events-none absolute inset-[12px] h-[calc(100%-24px)] w-[calc(100%-24px)]" aria-hidden="true">
                <rect x="1" y="1" width="98" height="178" fill="none" stroke={ink} strokeWidth="1.2" vectorEffect="non-scaling-stroke" opacity="0.6" />
                <rect x="3.5" y="2.2" width="93" height="175.6" fill="none" stroke={ink} strokeWidth="0.6" vectorEffect="non-scaling-stroke" opacity="0.5" />
                <g fill="none" stroke={ink} strokeWidth="0.8" vectorEffect="non-scaling-stroke" opacity="0.55">
                  <path d="M10 9 q7 -5 14 0 t14 0" vectorEffect="non-scaling-stroke" />
                  <path d="M90 9 q-7 -5 -14 0 t-14 0" vectorEffect="non-scaling-stroke" />
                  <path d="M10 171 q7 5 14 0 t14 0" vectorEffect="non-scaling-stroke" />
                  <path d="M90 171 q-7 5 -14 0 t-14 0" vectorEffect="non-scaling-stroke" />
                </g>
              </svg>
              <p className="relative text-[16px] italic opacity-75" style={{ fontFamily: "var(--body)" }}>
                a map for
              </p>
              <h1 className="relative mt-1 max-w-full break-words text-[44px] leading-[1.02]" style={displayStyle}>
                {name}
              </h1>
              {content.occasion ? (
                <p className="relative mt-3 text-[12px] font-semibold uppercase tracking-[0.3em] opacity-70">{content.occasion}</p>
              ) : null}
              <Compass className="relative mt-6 h-20 w-20" />
              <button
                type="button"
                onClick={breakSeal}
                disabled={stage !== "sealed"}
                aria-label={`Break the seal and open the map${content.senderName?.trim() ? ` from ${content.senderName}` : ""}`}
                className={`seal-button relative mt-7 rounded-full transition-transform duration-200 ease-calm hover:-rotate-6 hover:scale-105 ${focusRing}`}
              >
                <WaxSeal initial={initial} cracked={stage !== "sealed"} />
              </button>
              <p className="relative mt-4 text-[14px] italic opacity-70" style={{ fontFamily: "var(--body)" }}>
                Break the seal to open it
              </p>
              {content.senderName?.trim() ? <p className="relative mt-1 text-[13px] opacity-60">from {content.senderName}</p> : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="relative mx-auto max-w-[480px] px-4 pb-12 pt-8 sm:pt-14">
          <article className="relative overflow-hidden rounded-[4px] px-7 pb-24 pt-10 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.65)] sm:px-10" style={parchment}>
            <MapDoodles />
            <TrailPath drawn={false} />
            <Compass className="unfold absolute right-5 top-5 h-14 w-14 opacity-90" />

            <div className="relative">
              <p className="unfold pr-16 text-[12px] font-semibold uppercase tracking-[0.26em] text-[var(--paper-muted)]">
                A map for {name}
                {content.occasion ? <span aria-hidden="true"> · </span> : null}
                {content.occasion ? <span>{content.occasion}</span> : null}
              </p>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="unfold mt-3 text-balance pr-10 text-[36px] leading-[1.06] outline-none sm:text-[42px]"
                style={{ ...displayStyle, animationDelay: "120ms" }}
              >
                {content.headline}
              </h1>
              <Ornament align="start" className="unfold mt-5 text-[var(--paper-accent)]" style={{ animationDelay: "220ms" }} />
              <Paragraphs body={content.body} className="unfold mt-6" style={{ animationDelay: "320ms" }} />
              <SignOff signOff={content.signOff} senderName={content.senderName} className="unfold mt-8" />
            </div>

            {/* X marks the spot */}
            <div className="unfold absolute bottom-6 right-6 flex items-center gap-2" style={{ animationDelay: "1600ms" }}>
              <span className="text-[13px] font-semibold uppercase tracking-[0.22em] text-[var(--paper-muted)]">{name}</span>
              <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
                <path d="M4 4 L20 20 M20 4 L4 20" style={{ stroke: "var(--paper-accent)" }} strokeWidth="3.2" strokeLinecap="round" />
              </svg>
            </div>
          </article>

          <GiftList gifts={content.gifts} />
          <MadeWith />
        </div>
      )}

      <style>{`
        .folded { perspective: 1800px; transform-style: preserve-3d; }
        .flap { box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55); }
        .flap-l { transform-origin: left center; }
        .flap-r { transform-origin: right center; }
        .flap-l::after, .flap-r::after { content: ""; position: absolute; top: 0; bottom: 0; width: 16px; }
        .flap-l::after { right: 0; background: linear-gradient(90deg, transparent, rgba(60, 35, 15, 0.26)); }
        .flap-r::after { left: 0; background: linear-gradient(-90deg, transparent, rgba(60, 35, 15, 0.26)); }
        .inside { opacity: 0; }
        .folded[data-stage="unfolding"] .inside { opacity: 1; }
        .folded[data-stage="unfolding"] .face { opacity: 0; }
        .folded[data-stage="unfolding"] .flap-l { transform: rotateY(-178deg); opacity: 0; }
        .folded[data-stage="unfolding"] .flap-r { transform: rotateY(178deg); opacity: 0; }
        .seal { box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4); transition: box-shadow 300ms ease-out; }
        .seal[data-cracked="true"] { box-shadow: 0 0 0 rgba(0, 0, 0, 0); }
        .seal-half { transition: transform 420ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 420ms ease-out 120ms; }
        .seal[data-cracked="true"] .seal-l { transform: translate(-10px, 6px) rotate(-16deg); opacity: 0; }
        .seal[data-cracked="true"] .seal-r { transform: translate(10px, 8px) rotate(14deg); opacity: 0; }
        .trail { clip-path: inset(0 0 0 0); }
        @media (prefers-reduced-motion: no-preference) {
          .flap { transition: transform 1000ms cubic-bezier(0.45, 0.05, 0.25, 1) 250ms, opacity 380ms ease 1000ms, box-shadow 1000ms ease 250ms; }
          .face { transition: opacity 380ms ease 200ms; }
          .inside { transition: opacity 200ms ease 250ms; }
          .trail[data-drawn="false"] { animation: trail 2600ms cubic-bezier(0.45, 0, 0.55, 1) 300ms both; }
          .unfold { animation: unfold 900ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
        }
        @keyframes trail { from { clip-path: inset(0 0 100% 0); } }
        @keyframes unfold { from { opacity: 0; transform: translateY(10px); } }
      `}</style>
    </main>
  )
}
