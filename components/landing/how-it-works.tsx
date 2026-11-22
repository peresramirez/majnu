"use client"

import { Fragment, useEffect, useRef, type CSSProperties, type RefObject } from "react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { GiftScene } from "@/components/landing/gift-scene"
import { GLYPH, SCREENS_PER_STEP, SPAN, moonMarks, steps, windows } from "@/components/landing/how-it-works-steps"

// The landing page's "How it works", told one step at a time.
//
// The section is a tall track; its screen is sticky, so it stays put while the
// visitor scrolls through the track. The scroll position becomes one CSS
// variable, `--u` (steps of scroll since the section pinned, see
// how-it-works-steps.ts), and app/globals.css moves every letter from it: the
// step on screen lifts and blurs away like mist in moonlight, and the next one
// settles in. After the last step the track ends and the page scrolls on.
//
// Story mode is pure CSS, under `(prefers-reduced-motion: no-preference) and
// (scripting: enabled)`. Otherwise (reduced motion, no JavaScript, older
// browsers) the same markup is a plain list of the three steps. The classes
// here are that list; app/globals.css overrides them in story mode.
//
// Screen readers and search engines read the real text (`.story-text`): the
// heading, the line, and three level-3 headings with their lines, in order. In
// story mode it is visually hidden, never removed, and the letters people see
// are an aria-hidden copy (`.story-visual`).

// A drift for each letter between -1 and 1, the same on the server and in the
// browser, so the letters scatter a little differently as they leave.
const drift = (n: number) => {
  const x = Math.sin(n * 12.9898 + 4.1414) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

// Splits text into inline-block pieces (letters or words) that move on their
// own. Words stay whole so lines only break between them. `--c` is the piece's
// place in the wave, from `from` to `to`.
function Glyphs({ text, by, from, to, seed }: { text: string; by: "letter" | "word"; from: number; to: number; seed: number }) {
  const words = text.split(" ")
  const total = by === "letter" ? words.join("").length : words.length
  let n = 0
  return words.map((word, w) => (
    <Fragment key={w}>
      {w > 0 && " "}
      <span className="story-word">
        {(by === "letter" ? Array.from(word) : [word]).map((piece) => {
          const i = n++
          const style = {
            "--c": (from + ((to - from) * i) / Math.max(1, total - 1)).toFixed(3),
            "--r": drift(seed + i).toFixed(3),
          } as CSSProperties
          return (
            <span key={i} className="story-glyph" style={style}>
              {piece}
            </span>
          )
        })}
      </span>
    </Fragment>
  ))
}

// The timeline in CSS: `--enter` and `--leave` per step and per progress mark.
const NEVER = 99
const timing = (k: number) =>
  ({ "--enter": windows[k].enter.toFixed(3), "--leave": (windows[k].leave ?? NEVER).toFixed(3) }) as CSSProperties

const track = {
  "--u": 0,
  "--seg": `${SCREENS_PER_STEP * 100}svh`,
  "--steps": steps.length,
  "--span": SPAN,
  "--glyph": GLYPH,
} as CSSProperties

// Reads the scroll position on `scroll` (passive) at most once a frame, eases
// towards it and writes `--u`. The section's place in the page is measured on
// resize, never while scrolling, so a frame reads only `scrollY`.
function useStoryScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const section = ref.current
    const screen = section?.querySelector<HTMLElement>("[data-story-screen]")
    if (!section || !screen) return

    let live = false
    let top = 0
    let seg = 1
    let current = 0
    let raf = 0
    let last = 0

    const goal = () => Math.min(steps.length + 1, Math.max(-2, (window.scrollY - top) / seg))
    const write = (u: number) => section.style.setProperty("--u", u.toFixed(4))
    const measure = () => {
      // Story mode is decided in CSS; the screen is only sticky there.
      live = getComputedStyle(screen).position === "sticky"
      top = section.getBoundingClientRect().top + window.scrollY
      seg = (section.offsetHeight - screen.offsetHeight) / steps.length || 1
    }
    const tick = (now: number) => {
      const g = goal()
      // About 70 ms behind the scroll, the same at 60 and 120 Hz: enough to
      // smooth a mouse wheel's steps without the letters trailing a finger.
      const dt = last ? Math.min(64, now - last) : 16
      last = now
      current += (g - current) * (1 - Math.exp(-dt / 70))
      if (Math.abs(g - current) < 0.001) current = g
      write(current)
      if (current === g) {
        raf = 0
        last = 0
      } else raf = requestAnimationFrame(tick)
    }
    const wake = () => {
      if (live && !raf) raf = requestAnimationFrame(tick)
    }
    const remeasure = () => {
      measure()
      wake()
    }

    measure()
    if (live) {
      current = goal()
      write(current)
    }
    // The section moves when anything above it changes height (the hero's
    // message box grows, fonts arrive), so watch the body as well as the track.
    const resize = new ResizeObserver(remeasure)
    resize.observe(section)
    resize.observe(document.body)
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    window.addEventListener("scroll", wake, { passive: true })
    motion.addEventListener("change", remeasure)
    return () => {
      cancelAnimationFrame(raf)
      resize.disconnect()
      window.removeEventListener("scroll", wake)
      motion.removeEventListener("change", remeasure)
    }
  }, [ref])
}

export function HowItWorks() {
  const ref = useRef<HTMLElement>(null)
  useStoryScroll(ref)

  return (
    <section ref={ref} id="how" aria-labelledby="how-title" className="story relative z-10" style={track}>
      {/* Where the moon should be on its way (gift-scene.tsx reads them): one at
          each point of the timeline, placed in the track so they scroll with it. */}
      {moonMarks.map((mark) => (
        <span
          key={mark.at}
          data-moon={mark.t}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 h-px w-px"
          style={{ top: `calc(${mark.at.toFixed(3)} * var(--seg))` }}
        />
      ))}

      <div data-story-screen className="story-screen mx-auto max-w-6xl px-5 pb-20 pt-2 sm:px-8 md:pb-24 md:pt-0">
        <div className="md:max-w-md xl:max-w-xl">
          <div className="flex items-center justify-between gap-4 md:justify-start md:gap-5">
            {/* The label keeps the name in sentence case: in story mode the
                heading is set in capitals, which Chrome passes on to screen readers. */}
            <h2 id="how-title" aria-label="How it works" className="story-heading font-display text-4xl leading-tight sm:text-5xl">
              How it works
            </h2>
            {/* Three moons, one per step: the current one lit in rose gold. */}
            <div aria-hidden="true" className="story-marks hidden items-center gap-2.5">
              {steps.map((step, k) => (
                <span key={step.title} className="story-mark relative block h-4 w-4" style={timing(k)}>
                  <MoonPhase lit={step.lit} size={16} className="absolute inset-0 text-night-lilac/60" />
                  <MoonPhase lit={step.lit} size={16} className="story-mark-on absolute inset-0 text-night-rose" />
                </span>
              ))}
            </div>
          </div>
          <p className="story-intro mt-3 leading-relaxed text-night-lilac">
            Majnu would have given Layla the moon. Yours takes three steps.
          </p>
        </div>

        {/* Phones: the scene is part of the pinned screen. From md up it is the
            backdrop behind the hero and this section (app/(marketing)/page.tsx). */}
        <div className="story-scene relative -mx-5 mt-8 h-[min(110vw,440px)] sm:-mx-8 md:hidden">
          <GiftScene variant="story" />
        </div>

        <ol className="story-steps mt-8 flex flex-col gap-6 md:max-w-md xl:max-w-xl">
          {steps.map((step, k) => (
            <li key={step.title} className="story-step" style={timing(k)}>
              <div className="story-text flex gap-3.5">
                <MoonPhase lit={step.lit} size={26} className="mt-0.5 flex-none text-night-rose" />
                <div>
                  <h3 className="text-balance font-display text-2xl leading-tight">{step.title}</h3>
                  <p className="mt-1.5 text-pretty text-[15px] leading-normal text-night-lilac">{step.line}</p>
                </div>
              </div>
              <div aria-hidden="true" className="story-visual hidden select-none">
                <p className="text-balance font-display text-[clamp(34px,9.6vw,46px)] leading-[1.08] tracking-[-0.01em] text-night-petal md:text-[clamp(46px,5vw,72px)] md:leading-[1.04]">
                  <Glyphs text={step.title} by="letter" from={0} to={0.75} seed={k * 37} />
                </p>
                <p className="mt-3 max-w-[32ch] text-[17px] leading-[1.55] text-night-lilac md:mt-5 md:text-[19px]">
                  <Glyphs text={step.line} by="word" from={0.3} to={1} seed={k * 37 + 19} />
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
