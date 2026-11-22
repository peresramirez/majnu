"use client"

import { useEffect } from "react"

// While a sheet is open on a phone, --vv-height and --vv-top on <html> follow
// the part of the screen the visitor can actually see. The on-screen keyboard
// shrinks the visual viewport but not the layout one, so a sheet sized with
// 100dvh would keep its message box behind the keyboard; sized with these, the
// box sits just above it. Sheets fall back to 100dvh when the API is missing.
let users = 0

export function useVisualViewportVars(active: boolean) {
  useEffect(() => {
    const vv = typeof window === "undefined" ? null : window.visualViewport
    if (!active || !vv) return
    const root = document.documentElement
    const update = () => {
      root.style.setProperty("--vv-height", `${Math.round(vv.height)}px`)
      root.style.setProperty("--vv-top", `${Math.round(vv.offsetTop)}px`)
    }
    users++
    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      // Two sheets can be open at once (a preview over the finder): the vars
      // go only when the last one closes.
      if (--users === 0) {
        root.style.removeProperty("--vv-height")
        root.style.removeProperty("--vv-top")
      }
    }
  }, [active])
}
