"use client"

import { useSyncExternalStore } from "react"

// Whether the viewer asked for reduced motion. The server snapshot says yes,
// so nothing animates before the browser has answered.
const QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  )
}
