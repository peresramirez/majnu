import { describe, expect, it } from "vitest"
import { GLYPH, SCREENS_PER_STEP, SPAN, moonMarks, stepPosition, steps, windows } from "@/components/landing/how-it-works-steps"

const words = (s: string) => s.trim().split(/\s+/).length

// The developer asked for a section that reads at a glance: one big title and
// one line per step. These keep the next edit from growing it back into paragraphs.
describe("How it works steps", () => {
  it("has the finder's three steps", () => {
    expect(steps).toHaveLength(3)
  })

  it("keeps each title to two to five words", () => {
    for (const step of steps) {
      expect(words(step.title)).toBeGreaterThanOrEqual(2)
      expect(words(step.title)).toBeLessThanOrEqual(5)
    }
  })

  it("keeps each line to about ten words", () => {
    for (const step of steps) expect(words(step.line)).toBeLessThanOrEqual(12)
  })

  it("fills the moon one phase per step, ending full as it reaches Layla", () => {
    const lit = steps.map((s) => s.lit)
    for (let i = 1; i < lit.length; i++) expect(lit[i]).toBeGreaterThan(lit[i - 1])
    expect(lit[0]).toBeGreaterThan(0)
    expect(lit[lit.length - 1]).toBe(1)
  })

  it("keeps the brand's voice: no exclamation marks", () => {
    for (const step of steps) expect(`${step.title} ${step.line}`).not.toMatch(/!/)
  })
})

// The timeline runs in steps of scroll: 0 is where the section pins and
// steps.length where it lets go (how-it-works-steps.ts).
describe("How it works timeline", () => {
  const pinEnd = steps.length
  const settled = (k: number) => windows[k].enter + SPAN
  const gone = (k: number) => (windows[k].leave ?? Infinity) + SPAN

  it("gives each step about one screen of scroll", () => {
    expect(SCREENS_PER_STEP).toBeGreaterThanOrEqual(0.6)
    expect(SCREENS_PER_STEP).toBeLessThanOrEqual(1.2)
    expect(GLYPH).toBeLessThan(SPAN)
  })

  it("shows the first step settled by the time the section pins", () => {
    expect(settled(0)).toBeLessThanOrEqual(0)
    expect(windows[0].enter).toBeGreaterThan(-1 / SCREENS_PER_STEP)
  })

  it("lets each step leave before the next has settled, and never two at rest at once", () => {
    for (let k = 0; k < steps.length - 1; k++) {
      const leave = windows[k].leave
      expect(leave).not.toBeNull()
      // The old step is mostly gone before the new one starts to arrive...
      expect(windows[k + 1].enter).toBeGreaterThan(leave! + SPAN / 2)
      // ...and fully gone soon after.
      expect(gone(k)).toBeLessThan(settled(k + 1))
    }
  })

  it("keeps the last step on screen as the section lets go", () => {
    expect(windows[steps.length - 1].leave).toBeNull()
    expect(settled(steps.length - 1)).toBeLessThan(pinEnd)
  })

  it("rests on every step for a good part of a step's scroll", () => {
    for (let k = 0; k < steps.length; k++) {
      const from = Math.max(0, settled(k))
      const to = Math.min(pinEnd, windows[k].leave ?? pinEnd)
      expect(to - from).toBeGreaterThanOrEqual(0.5)
    }
  })

  it("moves the moon forward the whole way and lands it, full, as the last step settles", () => {
    for (let i = 1; i < moonMarks.length; i++) {
      expect(moonMarks[i].at).toBeGreaterThan(moonMarks[i - 1].at)
      expect(moonMarks[i].t).toBeGreaterThan(moonMarks[i - 1].t)
    }
    expect(moonMarks[0].t).toBe(0)
    const last = moonMarks[moonMarks.length - 1]
    expect(last.t).toBe(1)
    expect(last.at).toBeCloseTo(settled(steps.length - 1))
    // At the top of its arc while the middle step is on screen.
    const peak = moonMarks.find((m) => m.t === 0.5)
    expect(peak?.at).toBeCloseTo(settled(1))
  })
})

// how-it-works.tsx writes each step's position only when it changes, so a
// step at rest costs no style work. That only holds if the position stands
// still exactly where the step's letters stand still.
describe("stepPosition", () => {
  it("follows the scroll while the step arrives or leaves", () => {
    for (let k = 0; k < steps.length; k++) {
      const { enter, leave } = windows[k]
      expect(stepPosition(enter + SPAN / 2, k)).toBeCloseTo(enter + SPAN / 2)
      if (leave !== null) expect(stepPosition(leave + SPAN / 2, k)).toBeCloseTo(leave + SPAN / 2)
    }
  })

  it("stands still before, between and after", () => {
    for (let k = 0; k < steps.length; k++) {
      const { enter, leave } = windows[k]
      expect(stepPosition(enter - 1, k)).toBe(stepPosition(enter, k))
      const rest = leave ?? enter + SPAN + 2
      expect(stepPosition(enter + SPAN, k)).toBe(stepPosition(rest, k))
      expect(stepPosition((enter + SPAN + rest) / 2, k)).toBe(enter + SPAN)
      if (leave !== null) expect(stepPosition(leave + SPAN + 1, k)).toBe(leave + SPAN)
    }
  })
})
