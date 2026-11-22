"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

// Plays its `.reveal-item` children in when they scroll into view (styles in
// app/globals.css). Contents are only hidden after hydration and only while they
// are still below the fold, so content already on screen, reduced motion and a
// page without JavaScript all stay visible.
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle")

  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return
    setState("hidden")
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("shown")
          io.disconnect()
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} data-reveal={state} className={className}>
      {children}
    </div>
  )
}
