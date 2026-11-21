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

const ease = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (t: number) => Math.min(1, Math.max(0, t))

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
// The card is always 4:5: as tall as the card, 2048/1152 × 5/4 of its width,
// shifted by 90% of the overflow. The backdrop covers its box with container
// units: right-aligned, and 55% of any vertical overflow above it.
const CARD_WIDTH = (IW / IH) * (5 / 4)
const CARD_FRAME = {
  width: `${(CARD_WIDTH * 100).toFixed(3)}%`,
  height: "100%",
  left: `${((1 - CARD_WIDTH) * 0.9 * 100).toFixed(3)}%`,
  top: 0,
} as const
const coverWidth = `max(100cqw, ${((IW / IH) * 100).toFixed(3)}cqh)`
const coverHeight = `max(100cqh, ${((IH / IW) * 100).toFixed(3)}cqw)`
const BACKDROP_FRAME = {
  width: coverWidth,
  height: coverHeight,
  left: `calc(100cqw - ${coverWidth})`,
  top: `calc((100cqh - ${coverHeight}) * 0.55)`,
} as const

// "backdrop": pinned behind a long section; "card": a framed card that animates as it
// scrolls past; "panel": fills its parent, moon already given (sign-in pages).
export function GiftScene({ variant }: { variant: "backdrop" | "card" | "panel" }) {
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
    const layout = () => {
      const W = el.clientWidth, H = el.clientHeight
      if (!W || !H) return
      // Short, wide boxes (the panel as a phone banner) zoom in on the couple.
      const zoom = variant === "panel" && H < 420 ? 1.9 : 1
      // Where the painting sits when it is cropped to fill the box: keep the couple in view.
      const focus = variant === "backdrop" ? { x: 1, y: 0.55 } : { x: 0.9, y: zoom > 1 ? 0.24 : 0.5 }
      const s = Math.max(W / IW, H / IH) * zoom
      fr.style.width = `${IW * s}px`
      fr.style.height = `${IH * s}px`
      fr.style.left = `${(W - IW * s) * focus.x}px`
      fr.style.top = `${(H - IH * s) * focus.y}px`
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

    const target = () => {
      const vh = window.innerHeight
      if (variant === "backdrop") {
        const section = el.closest<HTMLElement>("[data-gift-track]")
        if (!section) return 0
        const rect = section.getBoundingClientRect()
        const travel = rect.height - vh
        return travel > 0 ? -rect.top / travel : 0
      }
      const rect = el.getBoundingClientRect()
      const travel = vh - rect.height
      return travel > 0 ? (vh - rect.bottom) / travel : 0
    }

    layout()
    if (reduceMotion || variant === "panel") {
      draw(1)
      const onResize = () => layout()
      window.addEventListener("resize", onResize)
      return () => window.removeEventListener("resize", onResize)
    }

    let current = clamp(target())
    let raf = 0
    draw(current)
    const tick = () => {
      const goal = clamp(target())
      current += (goal - current) * 0.12
      draw(current)
      raf = Math.abs(goal - current) > 0.0005 ? requestAnimationFrame(tick) : 0
    }
    const wake = () => { if (!raf) raf = requestAnimationFrame(tick) }
    const onResize = () => { layout(); wake() }
    window.addEventListener("scroll", wake, { passive: true })
    window.addEventListener("resize", onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", wake)
      window.removeEventListener("resize", onResize)
    }
  }, [variant])

  const backdrop = variant === "backdrop"
  const panel = variant === "panel"
  return (
    <div
      ref={box}
      aria-hidden="true"
      style={backdrop ? { containerType: "size" } : undefined}
      className={
        backdrop
          ? "pointer-events-none sticky top-0 h-[100svh] overflow-hidden"
          : panel
            ? "pointer-events-none absolute inset-0 overflow-hidden"
            : "relative aspect-[4/5] w-full overflow-hidden rounded-3xl ring-1 ring-inset ring-night-petal/10"
      }
    >
      <div
        ref={frame}
        className="absolute left-0 top-0 h-full w-full"
        style={variant === "card" ? CARD_FRAME : variant === "backdrop" ? BACKDROP_FRAME : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/majnu-layla-2048.webp"
          srcSet="/landing/majnu-layla-1280.webp 1280w, /landing/majnu-layla-2048.webp 2048w"
          sizes={backdrop ? "(min-aspect-ratio: 16/9) 100vw, 178vh" : panel ? "(min-width: 768px) 178vh, 380vw" : "222vw"}
          alt=""
          width={IW}
          height={IH}
          fetchPriority={backdrop || panel ? "high" : "auto"}
          loading={backdrop || panel ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 h-full w-full"
        />
        <svg viewBox={`0 0 ${IW} ${IH}`} className="absolute inset-0 h-full w-full">
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
      ) : (
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-night-plum/80 to-transparent" />
      )}
    </div>
  )
}
