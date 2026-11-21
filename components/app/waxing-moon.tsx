"use client"

import { useEffect, useState } from "react"
import { MoonPhase } from "@/components/brand/moon-phase"

// The loading sign: a moon going through one slow cycle, new to full and back,
// lit from the right while waxing and from the left while waning. A cycle takes
// 12 seconds (the brand asks for at least 10). With reduced motion it is a
// still half moon.
export function WaxingMoon({ size = 20, className = "", period = 12_000 }: { size?: number; className?: string; period?: number }) {
  const [phase, setPhase] = useState(0.25)

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (query.matches) return
    let frame = 0
    let last = 0
    const start = performance.now() - period * 0.25
    const tick = (now: number) => {
      // A dozen updates a second is plenty for something this slow.
      if (now - last > 80) {
        last = now
        setPhase(((now - start) % period) / period)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [period])

  const waning = phase > 0.5
  const lit = Math.max(0.06, waning ? 2 - phase * 2 : phase * 2)
  return (
    <span className={`inline-flex ${className}`} style={waning ? { transform: "scaleX(-1)" } : undefined} aria-hidden="true">
      <MoonPhase lit={lit} size={size} />
    </span>
  )
}

export function MoonLoader({ label }: { label: string }) {
  return (
    <div role="status" className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-night-lilac">
      <WaxingMoon size={36} className="text-night-rose" />
      <p className="text-sm">{label}</p>
    </div>
  )
}
