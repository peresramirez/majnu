"use client"

// The moon passing from Majnu's hands to Layla's over the painting, on the
// pitch deck's last slide. The drawing is the landing page's (the moon in the
// painting's own coordinates, travelling on a curve from the light above his
// hands to her open palm, filling from a crescent to full as it goes; see
// components/landing/gift-scene.tsx), copied here so the deck owns its piece.
// Here it runs on a clock when its slide is shown, not on scroll.
//
// Rendered at rest, the moon is already in Layla's hand: that is what the
// server sends, what print and the phone column show, and all that someone
// who asks for reduced motion sees.
import { useEffect, useRef } from "react"

// The painting, /landing/majnu-layla-2048.webp.
export const PAINTING = { width: 2048, height: 1152 }
const FROM = { x: 1452, y: 486 } // the light above his cupped hands
const PEAK = { x: 1462, y: 20 } // control point of the arc above them
const TO = { x: 1489, y: 489 } // resting on her open palm

const DELAY_MS = 900
const DURATION_MS = 3800

const smooth = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (t: number) => Math.min(1, Math.max(0, t))

export function moonAt(t: number): { x: number; y: number; r: number } {
  const u = 1 - t
  const x = u * u * FROM.x + 2 * u * t * PEAK.x + t * t * TO.x
  const y = u * u * FROM.y + 2 * u * t * PEAK.y + t * t * TO.y
  const r = t < 0.5 ? lerp(9, 46, smooth(t / 0.5)) : lerp(46, 15, smooth((t - 0.5) / 0.5))
  return { x, y, r }
}

// The lit part of a moon of radius r centred on 0,0; `lit` runs from 0 (new) to 1 (full).
function litPath(r: number, lit: number): string {
  const e = 1 - 2 * clamp(lit)
  return `M0 ${-r}A${r} ${r} 0 0 1 0 ${r}A${Math.abs(e) * r} ${r} 0 0 ${e > 0 ? 0 : 1} 0 ${-r}Z`
}

function frame(t: number) {
  const { x, y, r } = moonAt(t)
  return {
    transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`,
    glowR: (r * 3.2).toFixed(1),
    glowOpacity: (0.45 + 0.45 * t).toFixed(2),
    r: r.toFixed(1),
    d: litPath(r, 0.18 + 0.82 * smooth(t)),
  }
}

const REST = frame(1)

export function MoonPassage() {
  const svg = useRef<SVGSVGElement>(null)
  const moon = useRef<SVGGElement>(null)
  const glow = useRef<SVGCircleElement>(null)
  const disc = useRef<SVGCircleElement>(null)
  const lit = useRef<SVGPathElement>(null)

  useEffect(() => {
    const slide = svg.current?.closest(".pd-slide")
    if (!slide) return
    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)")
    const column = window.matchMedia("(orientation: portrait) and (max-width: 900px)")
    let raf = 0
    let timer = 0

    const draw = (t: number) => {
      const f = frame(t)
      moon.current?.setAttribute("transform", f.transform)
      glow.current?.setAttribute("r", f.glowR)
      glow.current?.setAttribute("opacity", f.glowOpacity)
      disc.current?.setAttribute("r", f.r)
      lit.current?.setAttribute("d", f.d)
    }

    const stop = () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      raf = 0
    }

    const sync = () => {
      stop()
      const play = slide.hasAttribute("data-active") && motion.matches && !column.matches
      if (!play) return draw(1)
      // Start in his hands while the slide fades in, then pass the moon over.
      draw(0)
      timer = window.setTimeout(() => {
        const start = performance.now()
        const tick = (now: number) => {
          const p = clamp((now - start) / DURATION_MS)
          draw(smooth(p))
          raf = p < 1 ? requestAnimationFrame(tick) : 0
        }
        raf = requestAnimationFrame(tick)
      }, DELAY_MS)
    }

    sync()
    const observer = new MutationObserver(sync)
    observer.observe(slide, { attributes: true, attributeFilter: ["data-active"] })
    motion.addEventListener("change", sync)
    return () => {
      stop()
      observer.disconnect()
      motion.removeEventListener("change", sync)
    }
  }, [])

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${PAINTING.width} ${PAINTING.height}`}
      preserveAspectRatio="xMidYMid slice"
      className="pd-passage"
      aria-hidden="true"
      data-bleed=""
    >
      <defs>
        <radialGradient id="pd-passage-glow">
          <stop offset="0" stopColor="#FFE7D6" stopOpacity="0.9" />
          <stop offset="0.35" stopColor="#EAB394" stopOpacity="0.45" />
          <stop offset="1" stopColor="#EAB394" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pd-passage-face" cx="0.35" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#FFFBF8" />
          <stop offset="0.7" stopColor="#F7DED0" />
          <stop offset="1" stopColor="#EAB394" />
        </radialGradient>
      </defs>
      <g ref={moon} transform={REST.transform}>
        <circle ref={glow} r={REST.glowR} fill="url(#pd-passage-glow)" opacity={REST.glowOpacity} />
        <circle ref={disc} r={REST.r} fill="#F5EAF1" opacity="0.14" />
        <path ref={lit} d={REST.d} fill="url(#pd-passage-face)" />
      </g>
    </svg>
  )
}
