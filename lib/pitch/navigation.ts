// How the pitch deck (components/pitch/deck.tsx) turns keys, clicks, swipes
// and the address's hash into slides. Pure functions, so they are tested
// without a browser. The hash counts from 1 (#5 is the fifth slide), the code
// from 0.

export type DeckAction = "next" | "prev" | "first" | "last" | "fullscreen" | "notes"

// Keys a presenter or a clicker sends. Clickers usually send PageUp and
// PageDown; Shift+Space goes back as it does when scrolling a page.
export function keyAction(key: string, shift = false): DeckAction | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
    case "PageDown":
      return "next"
    case " ":
    case "Spacebar":
      return shift ? "prev" : "next"
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp":
      return "prev"
    case "Home":
      return "first"
    case "End":
      return "last"
    case "f":
    case "F":
      return "fullscreen"
    case "n":
    case "N":
      return "notes"
    default:
      return null
  }
}

// A click or tap on the left part of the screen goes back, anywhere else
// forward, so a presenter can click through without aiming.
export const BACK_ZONE = 0.35

export function clickAction(x: number, width: number): "next" | "prev" {
  return x < width * BACK_ZONE ? "prev" : "next"
}

// A horizontal swipe of at least `threshold` pixels, clearly more sideways
// than up or down; anything else is a tap or a scroll.
export function swipeAction(dx: number, dy: number, threshold = 48): "next" | "prev" | null {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.2) return null
  return dx < 0 ? "next" : "prev"
}

// "#5" opens the fifth slide. Numbers past either end open the first or last
// slide; anything that is not a number is ignored.
export function slideFromHash(hash: string, count: number): number | null {
  const text = hash.replace(/^#/, "").trim()
  if (!/^\d+$/.test(text) || count < 1) return null
  return Math.min(Math.max(Number(text), 1), count) - 1
}

export function hashForSlide(index: number): string {
  return `#${index + 1}`
}

// Elapsed time in the presenter view, as m:ss.
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}
