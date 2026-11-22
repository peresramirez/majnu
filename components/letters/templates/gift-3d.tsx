"use client"

// gift-3d (issue #99): a gift in a round keepsake tin, in 3D, distinct from
// the 3D gift box. Tapping unscrews the lid, which lifts away; a warm glow
// rises from inside and the gift card spins up out of the tin to face them.
// Then the page shows the gift card with its code, Copy and Redeem, and the
// note with the voice note.
//
// The code is never drawn in the scene and is not on the page until the tin
// is open (the gift cards render only then, with the code shown).
//
// three.js is never imported here. The scene module is fetched with import()
// after mounting, and only when motion is allowed and the browser has WebGL
// (./three-kit/reveal.ts). Until it is ready, and whenever it cannot run, the
// page shows a still drawing of the tin and the button opens it at once.
import { useCallback } from "react"
import type { LetterContent } from "@/lib/letters/schema"
import { displayStyle, focusRing, MadeWith, paperStyle, Stars } from "../chrome"
import { GiftCard } from "../gift-card"
import { Paragraphs, SignOff } from "../letter-text"
import { wholeName } from "../names"
import { paletteOf } from "../theme"
import { VoiceNoteSlot } from "../voice-player"
import { TinDrawing } from "./gift-3d/drawing"
import { tinWords } from "./gift-3d/words"
import { readColors, readFonts } from "./three-kit/paper"
import { useThreeReveal, type SceneHandlers } from "./three-kit/reveal"
// Types only: erased at build time, so this does not pull three.js in.
import type { TinScene } from "./gift-3d/scene"

export function Gift3D({ content }: { content: LetterContent }) {
  const name = wholeName(content.recipientName)
  const gifts = content.gifts ?? []
  const dark = paletteOf(content.theme).dark

  const load = useCallback(
    (el: HTMLElement, handlers: SceneHandlers): Promise<TinScene> =>
      import("./gift-3d/scene").then(({ createTinScene }) =>
        createTinScene(el, {
          colors: readColors(el),
          fonts: readFonts(el, content.theme?.font === "script"),
          words: tinWords(content),
          ...handlers,
        }),
      ),
    [content],
  )
  const { stage, live, stageRef, headingRef, open } = useThreeReveal({ load, holdMs: 800 })

  return (
    <main className="relative min-h-[100svh] overflow-hidden" style={{ background: "var(--page)", color: "var(--page-ink)" }}>
      {dark ? <Stars /> : null}

      {stage !== "open" ? (
        <div className="relative min-h-[100svh]">
          <div ref={stageRef} aria-hidden="true" onClick={() => void open()} className="tin-stage absolute inset-0 cursor-pointer" data-live={live ? "true" : "false"}>
            <span className="tin-still absolute inset-x-0 top-[56%] flex -translate-y-1/2 justify-center">
              <TinDrawing forName={`For ${name}`} className="tin-still-art h-auto w-[min(74vw,50svh,380px)]" />
            </span>
          </div>

          <div className="pointer-events-none relative flex min-h-[100svh] flex-col items-center justify-between px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-14 sm:pt-16">
            <div className={`tin-words text-center ${stage !== "closed" ? "opacity-0" : ""}`}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[var(--page-muted)]">{content.occasion || "A gift"}</p>
              <h1 className="mt-3 text-balance text-[34px] leading-tight sm:text-[40px]" style={displayStyle}>
                For {name}
              </h1>
            </div>

            <button
              type="button"
              onClick={() => void open()}
              disabled={stage !== "closed"}
              aria-label={`Open the tin${content.senderName?.trim() ? `: a gift from ${content.senderName}` : ""}`}
              className={`pointer-events-auto rounded-full bg-[var(--accent)] px-7 py-3.5 text-[15px] font-semibold text-[var(--accent-ink)] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)] transition-[opacity,transform] duration-300 ease-calm hover:-translate-y-px active:translate-y-0 ${
                stage !== "closed" ? "opacity-0" : ""
              } ${focusRing}`}
            >
              Open the tin
            </button>
          </div>
        </div>
      ) : (
        <div className="relative mx-auto max-w-[480px] px-4 pb-12 pt-10 sm:pt-16">
          {/* The glow the card came out of, still warm behind it. */}
          <div aria-hidden="true" className="tin-glow pointer-events-none absolute left-1/2 top-24 h-[360px] w-[360px] -translate-x-1/2 rounded-full" style={{ background: "radial-gradient(closest-side, color-mix(in srgb, var(--accent) 40%, transparent), transparent)" }} />
          <p className="rise relative text-center text-[12px] font-semibold uppercase tracking-[0.28em] text-[var(--page-muted)]">
            For {name}
            {content.occasion ? <span aria-hidden="true"> · </span> : null}
            {content.occasion ? <span>{content.occasion}</span> : null}
          </p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="rise relative mt-3 text-balance text-center text-[38px] leading-[1.06] tracking-[-0.01em] outline-none sm:text-[46px]"
            style={{ ...displayStyle, animationDelay: "80ms" }}
          >
            {content.headline}
          </h1>

          {gifts.length ? (
            <div className="card-in relative mt-8 space-y-5">
              {gifts.map((g, i) => (
                <GiftCard key={i} gift={g} codeShown eyebrow={gifts.length > 1 ? `Gift ${i + 1} of ${gifts.length}` : "Your gift"} />
              ))}
            </div>
          ) : null}

          <article className="rise relative mt-6 rounded-[22px] px-6 pb-9 pt-8 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)]" style={{ ...paperStyle, animationDelay: "600ms" }}>
            {/* The sender's voice, on the note that came with the gift. */}
            <VoiceNoteSlot tone="paper" className="mb-7 border-b border-[var(--line)] pb-6" />
            <Paragraphs body={content.body} />
            <SignOff signOff={content.signOff} senderName={content.senderName} className="mt-8" />
          </article>
          <MadeWith />
        </div>
      )}

      <style>{`
        .tin-still { transition: opacity 600ms cubic-bezier(0.22, 0.61, 0.36, 1); }
        .tin-words { transition: opacity 400ms ease-out; }
        .tin-stage[data-live="true"] .tin-still { opacity: 0; }
        @media (prefers-reduced-motion: no-preference) {
          .tin-stage[data-live="false"] .tin-still-art { animation: tin-idle 5s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
          .rise { animation: rise 900ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
          .card-in { animation: card-in 1000ms cubic-bezier(0.22, 0.61, 0.36, 1) 200ms both; }
          .tin-glow { animation: tin-glow 1600ms ease-out both; }
        }
        @keyframes tin-idle { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-6px) rotate(1deg); } }
        @keyframes rise { from { opacity: 0; transform: translateY(14px); } }
        @keyframes card-in { from { opacity: 0; transform: translateY(60px) scale(0.94); } }
        @keyframes tin-glow { from { opacity: 0; transform: translateX(-50%) scale(0.6); } }
      `}</style>
    </main>
  )
}
