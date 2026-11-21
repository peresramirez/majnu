import { describe, expect, it } from "vitest"
import {
  TYPEWRITER_TIMING,
  commonPrefixLength,
  typewriterStart,
  typewriterStep,
  typewriterText,
  type TypewriterState,
} from "@/components/finder/typewriter"

const EXAMPLES = ["Find a gift for my mother", "Find a gift for my girlfriend", "Find a gift for my dad who loves fishing"]

// Every text shown from the start until the cycle is back on the first example.
function cycle(examples: string[]): { texts: string[]; delays: number[] } {
  let state: TypewriterState = typewriterStart(examples)
  const texts = [typewriterText(examples, state)]
  const delays: number[] = []
  for (let i = 0; i < 1000; i++) {
    const next = typewriterStep(examples, state)
    state = next.state
    texts.push(typewriterText(examples, state))
    delays.push(next.delay)
    if (state.index === 0 && state.phase === "holding") break
  }
  return { texts, delays }
}

describe("typewriter", () => {
  it("starts on the first example in full, as the server renders it", () => {
    expect(typewriterText(EXAMPLES, typewriterStart(EXAMPLES))).toBe(EXAMPLES[0])
  })

  it("measures the shared start of two examples", () => {
    expect(commonPrefixLength(EXAMPLES[0], EXAMPLES[1])).toBe("Find a gift for my ".length)
    expect(commonPrefixLength("abc", "abc")).toBe(3)
    expect(commonPrefixLength("", "abc")).toBe(0)
  })

  it("shows every example in full, in order, and comes back to the first", () => {
    const { texts } = cycle(EXAMPLES)
    const full = texts.filter((t) => EXAMPLES.includes(t))
    expect([...new Set(full)]).toEqual(EXAMPLES)
    expect(texts[texts.length - 1]).toBe(EXAMPLES[0])
  })

  it("deletes only back to what the next example shares", () => {
    const { texts } = cycle(EXAMPLES)
    const shortest = Math.min(...texts.map((t) => t.length))
    expect(shortest).toBe("Find a gift for my ".length)
    expect(texts.every((t) => t.startsWith("Find a gift for my"))).toBe(true)
  })

  it("changes one character at a time", () => {
    const { texts } = cycle(EXAMPLES)
    for (let i = 1; i < texts.length; i++) {
      const a = texts[i - 1]
      const b = texts[i]
      if (a === b) continue
      expect(Math.abs(a.length - b.length)).toBe(1)
    }
  })

  it("holds a finished example longer than it takes to type a letter", () => {
    const state: TypewriterState = { index: 1, length: EXAMPLES[1].length - 1, phase: "typing" }
    const next = typewriterStep(EXAMPLES, state)
    expect(next.state.phase).toBe("holding")
    expect(next.delay).toBe(TYPEWRITER_TIMING.hold)
    expect(typewriterStep(EXAMPLES, { index: 1, length: 3, phase: "typing" }).delay).toBe(TYPEWRITER_TIMING.type)
  })

  it("deletes faster than it types, and pauses before the next example", () => {
    const holding: TypewriterState = { index: 0, length: EXAMPLES[0].length, phase: "holding" }
    const deleting = typewriterStep(EXAMPLES, holding)
    expect(deleting.state.phase).toBe("deleting")
    expect(deleting.delay).toBeLessThan(TYPEWRITER_TIMING.type)
    const atPrefix: TypewriterState = { index: 0, length: "Find a gift for my ".length + 1, phase: "deleting" }
    const switched = typewriterStep(EXAMPLES, atPrefix)
    expect(switched.state).toEqual({ index: 1, length: "Find a gift for my ".length, phase: "typing" })
    expect(switched.delay).toBe(TYPEWRITER_TIMING.pause)
  })

  it("copes with examples that share nothing, and with a single example", () => {
    const { texts } = cycle(["One", "Two"])
    expect(texts).toContain("")
    expect(texts).toContain("Two")
    const single = typewriterStep(["Only"], typewriterStart(["Only"]))
    expect(typewriterText(["Only"], single.state)).toBe("Only")
  })
})
