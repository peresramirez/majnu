"use client"

import { useEffect, useRef } from "react"

// Majnu gives Layla the moon. The painting is static; the moon is drawn on top in
// the painting's own coordinates and travels from his hands to hers as you scroll,
// filling from a crescent to full on the way.
const IW = 2048
const IH = 1152
const FROM = { x: 1452, y: 486 } // the light above his cupped hands
const PEAK = { x: 1462, y: 20 } // control point of the arc above them
const TO = { x: 1489, y: 489 } // resting on her open palm
// The middle of the couple and of the moon's arc, as a share of the painting.
const COUPLE = { x: 1470 / IW, y: 0.515 }
// The phone story zooms in on the couple: it shows 1/1.28 of the painting's
// height, from just above the top of the moon's arc to just below their feet.
const STORY_ZOOM = 1.28

const ease = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (t: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, t))

function pointAt(t: number) {
  const u = 1 - t
  return {
    x: u * u * FROM.x + 2 * u * t * PEAK.x + t * t * TO.x,
    y: u * u * FROM.y + 2 * u * t * PEAK.y + t * t * TO.y,
  }
}
function radiusAt(t: number) {
  return t < 0.5 ? lerp(9, 46, ease(t / 0.5)) : lerp(46, 15, ease((t - 0.5) / 0.5))
}
// Lit part of a moon of radius r centred on 0,0; `lit` runs from 0 (new) to 1 (full).
function litPath(r: number, lit: number) {
  const e = 1 - 2 * clamp(lit)
  return `M0 ${-r}A${r} ${r} 0 0 1 0 ${r}A${Math.abs(e) * r} ${r} 0 0 ${e > 0 ? 0 : 1} 0 ${-r}Z`
}

// Where layout() will put the painting, in CSS, so the page renders it there
// from the start and nothing moves (a layout shift) when the script takes over.
// Both cover their box with container units. The backdrop is right-aligned, with
// 55% of any vertical overflow above it; the story is zoomed in and centred on
// the couple, without ever showing past the painting's edges.
const coverWidth = `max(100cqw, ${((IW / IH) * 100).toFixed(3)}cqh)`
const coverHeight = `max(100cqh, ${((IH / IW) * 100).toFixed(3)}cqw)`
const BACKDROP_FRAME = {
  width: coverWidth,
  height: coverHeight,
  left: `calc(100cqw - ${coverWidth})`,
  top: `calc((100cqh - ${coverHeight}) * 0.55)`,
} as const
const storyWidth = `calc(${coverWidth} * ${STORY_ZOOM})`
const storyHeight = `calc(${coverHeight} * ${STORY_ZOOM})`
const STORY_FRAME = {
  width: storyWidth,
  height: storyHeight,
  left: `clamp(100cqw - ${storyWidth}, 50cqw - ${storyWidth} * ${COUPLE.x.toFixed(4)}, 0px)`,
  top: `clamp(100cqh - ${storyHeight}, 50cqh - ${storyHeight} * ${COUPLE.y}, 0px)`,
} as const

type Mark = { y: number; t: number }

// Where the moon should be at the current scroll position. The marks are points
// in the page (data-moon, placed by how-it-works.tsx) with the moon's progress
// when each reaches the top of the screen; in between it moves evenly.
function journey(marks: Mark[], y: number) {
  if (y <= marks[0].y) return marks[0].t
  for (let i = 1; i < marks.length; i++) {
    const a = marks[i - 1]
    const b = marks[i]
    if (y < b.y) return b.y > a.y ? lerp(a.t, b.t, (y - a.y) / (b.y - a.y)) : b.t
  }
  return marks[marks.length - 1].t
}

// "backdrop": pinned behind the hero and How it works (desktop landing);
// "story": fills its box inside How it works' pinned screen (phone landing);
// "panel": fills its parent, moon already given (sign-in pages).
// The first two follow the moon marks of How it works.
export function GiftScene({ variant }: { variant: "backdrop" | "story" | "panel" }) {
  const box = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const moon = useRef<SVGGElement>(null)
  const glow = useRef<SVGCircleElement>(null)
  const disc = useRef<SVGCircleElement>(null)
  const lit = useRef<SVGPathElement>(null)

  useEffect(() => {
    const el = box.current, fr = frame.current
    if (!el || !fr) return
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    // A hidden scene (the backdrop on phones, the story from md up) does no work.
    let shown = false
    const layout = () => {
      const W = el.clientWidth, H = el.clientHeight
      shown = W > 0 && H > 0
      if (!shown) return
      // Short, wide boxes (the panel as a phone banner) zoom in on the couple.
      const zoom = variant === "story" ? STORY_ZOOM : variant === "panel" && H < 420 ? 1.9 : 1
      const s = Math.max(W / IW, H / IH) * zoom
      const w = IW * s, h = IH * s
      let left: number, top: number
      if (variant === "story") {
        left = clamp(W / 2 - COUPLE.x * w, W - w, 0)
        top = clamp(H / 2 - COUPLE.y * h, H - h, 0)
      } else {
        // Where the painting sits when it is cropped to fill the box: keep the couple in view.
        const focus = variant === "backdrop" ? { x: 1, y: 0.55 } : { x: 0.9, y: zoom > 1 ? 0.24 : 0.5 }
        left = (W - w) * focus.x
        top = (H - h) * focus.y
      }
      fr.style.width = `${w}px`
      fr.style.height = `${h}px`
      fr.style.left = `${left}px`
      fr.style.top = `${top}px`
    }

    const draw = (p: number) => {
      const t = clamp(p)
      const { x, y } = pointAt(t)
      const r = radiusAt(t)
      moon.current?.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`)
      glow.current?.setAttribute("r", (r * 3.2).toFixed(1))
      glow.current?.setAttribute("opacity", (0.45 + 0.45 * t).toFixed(2))
      disc.current?.setAttribute("r", r.toFixed(1))
      lit.current?.setAttribute("d", litPath(r, 0.18 + 0.82 * ease(t)))
    }

    // The marks' places in the page, measured on resize, so scrolling reads
    // only scrollY.
    const scope = el.closest<HTMLElement>("[data-gift-track]")
    let marks: Mark[] = []
    const measureMarks = () => {
      if (!scope) return
      marks = Array.from(scope.querySelectorAll<HTMLElement>("[data-moon]"), (m) => ({
        y: m.getBoundingClientRect().top + window.scrollY,
        t: Number(m.dataset.moon),
      })).sort((a, b) => a.y - b.y)
    }
    measureMarks()

    let wake = () => {}
    const sized = new ResizeObserver(() => {
      layout()
      wake()
    })
    sized.observe(el)
    layout()
    if (reduceMotion || variant === "panel" || marks.length === 0) {
      draw(1)
      return () => sized.disconnect()
    }

    let current = journey(marks, window.scrollY)
    let raf = 0
    draw(current)
    const tick = () => {
      const goal = journey(marks, window.scrollY)
      current += (goal - current) * 0.12
      if (Math.abs(goal - current) <= 0.0005) current = goal
      draw(current)
      raf = current === goal ? 0 : requestAnimationFrame(tick)
    }
    wake = () => {
      if (shown && !raf) raf = requestAnimationFrame(tick)
    }
    // The marks move when the page above them changes height.
    const moved = new ResizeObserver(() => {
      measureMarks()
      wake()
    })
    if (scope) moved.observe(scope)
    window.addEventListener("scroll", wake, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      sized.disconnect()
      moved.disconnect()
      window.removeEventListener("scroll", wake)
    }
  }, [variant])

  const backdrop = variant === "backdrop"
  const story = variant === "story"
  const panel = variant === "panel"
  return (
    <div
      ref={box}
      aria-hidden="true"
      style={backdrop || story ? { containerType: "size" } : undefined}
      className={
        backdrop
          ? "pointer-events-none sticky top-0 h-[100svh] overflow-hidden"
          : // The story fades into the page above and below; the panel's fades
            // sit in its parent (app/(auth)/layout.tsx).
            `pointer-events-none absolute inset-0 overflow-hidden${story ? " story-scene-fade" : ""}`
      }
    >
      <div
        ref={frame}
        className="absolute left-0 top-0 h-full w-full"
        style={backdrop ? BACKDROP_FRAME : story ? STORY_FRAME : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/majnu-layla-2048.webp"
          srcSet="/landing/majnu-layla-1280.webp 1280w, /landing/majnu-layla-2048.webp 2048w"
          sizes={backdrop ? "(min-aspect-ratio: 16/9) 100vw, 178vh" : panel ? "(min-width: 768px) 178vh, 380vw" : "240vw"}
          alt=""
          width={IW}
          height={IH}
          fetchPriority={backdrop || panel ? "high" : "auto"}
          loading={backdrop || panel ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 h-full w-full"
        />
        {/* The moon breathes gently even while nobody scrolls (an opacity
            animation on the whole drawing, so the compositor runs it). */}
        <svg
          viewBox={`0 0 ${IW} ${IH}`}
          className={`absolute inset-0 h-full w-full${panel ? "" : " motion-safe:animate-[moon-glow_7s_ease-in-out_infinite]"}`}
        >
          <defs>
            <radialGradient id={`glow-${variant}`}>
              <stop offset="0" stopColor="#FFE7D6" stopOpacity="0.9" />
              <stop offset="0.35" stopColor="#EAB394" stopOpacity="0.45" />
              <stop offset="1" stopColor="#EAB394" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`face-${variant}`} cx="0.35" cy="0.35" r="0.8">
              <stop offset="0" stopColor="#FFFBF8" />
              <stop offset="0.7" stopColor="#F7DED0" />
              <stop offset="1" stopColor="#EAB394" />
            </radialGradient>
          </defs>
          <g ref={moon} transform={`translate(${FROM.x} ${FROM.y})`}>
            <circle
              ref={glow}
              r="29"
              fill={`url(#glow-${variant})`}
              opacity="0.45"
              className={panel ? "motion-safe:animate-[moon-breathe_6s_ease-in-out_infinite]" : undefined}
            />
            <circle ref={disc} r="9" fill="#F5EAF1" opacity="0.14" />
            <path ref={lit} d={litPath(9, 0.18)} fill={`url(#face-${variant})`} />
          </g>
        </svg>
      </div>
      {backdrop ? (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-night-plum/90 via-night-plum/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-night-plum to-transparent" />
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-night-plum/70 to-transparent" />
        </>
      ) : panel ? (
        // The fades into the page sit in the parent, outside this clipped box, so they
        // can overlap its edge and hide the anti-aliased seam.
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-night-plum/60 to-transparent" />
      ) : null}
    </div>
  )
}
