// The hero's message box types out example requests one after another. The
// cycle is a pure step function, so it can be tested without timers; the hook
// below drives it, and shows a still first example with reduced motion.
//
// Between examples it deletes only back to what the next one shares ("Find a
// gift for my "), so the sentence seems to change its mind rather than restart.
import { useEffect, useState } from "react"

export type TypewriterState = { index: number; length: number; phase: "typing" | "holding" | "deleting" }

// Milliseconds. Typing is unhurried, as the brand asks; deleting is quicker.
export const TYPEWRITER_TIMING = { type: 70, hold: 2200, delete: 30, pause: 380 }

export function commonPrefixLength(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

// Starts on the first example in full, the same text the server renders.
export function typewriterStart(examples: readonly string[]): TypewriterState {
  return { index: 0, length: examples[0]?.length ?? 0, phase: "holding" }
}

export function typewriterText(examples: readonly string[], state: TypewriterState): string {
  return (examples[state.index] ?? "").slice(0, state.length)
}

// The next state and how long to show it before stepping again.
export function typewriterStep(
  examples: readonly string[],
  state: TypewriterState,
  timing = TYPEWRITER_TIMING,
): { state: TypewriterState; delay: number } {
  const current = examples[state.index] ?? ""
  if (state.phase === "typing") {
    const length = state.length + 1
    if (length >= current.length) return { state: { ...state, length: current.length, phase: "holding" }, delay: timing.hold }
    return { state: { ...state, length }, delay: timing.type }
  }
  const nextIndex = examples.length ? (state.index + 1) % examples.length : 0
  const keep = commonPrefixLength(current, examples[nextIndex] ?? "")
  const length = Math.min(state.length, current.length) - 1
  if (length > keep) return { state: { ...state, length, phase: "deleting" }, delay: timing.delete }
  return { state: { index: nextIndex, length: keep, phase: "typing" }, delay: timing.pause }
}

// The placeholder text to show now. Paused while `active` is false (the
// visitor has typed something, so the placeholder is hidden) and while the
// tab is in the background.
export function useTypewriter(examples: readonly string[], active: boolean): string {
  const [state, setState] = useState(() => typewriterStart(examples))
  const [reduced, setReduced] = useState(true)

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    if (reduced || !active || examples.length < 2) return
    let timer = 0
    let current = state
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        if (document.hidden) return schedule(1000)
        const next = typewriterStep(examples, current)
        current = next.state
        setState(next.state)
        schedule(next.delay)
      }, delay)
    }
    schedule(current.phase === "holding" ? TYPEWRITER_TIMING.hold : TYPEWRITER_TIMING.type)
    return () => window.clearTimeout(timer)
    // `state` is read once when the cycle (re)starts; the timer carries it on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examples, active, reduced])

  // With reduced motion the first example stays still and complete.
  return reduced ? (examples[0] ?? "") : typewriterText(examples, state)
}
