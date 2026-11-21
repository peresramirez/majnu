import { describe, expect, it } from "vitest"
import { steps } from "@/components/landing/how-it-works-steps"

const words = (s: string) => s.trim().split(/\s+/).length

// The developer asked for a section that reads at a glance: less text, more
// to look at. These keep the next edit from growing it back into paragraphs.
describe("How it works steps", () => {
  it("has the finder's three steps, each with its own picture", () => {
    expect(steps).toHaveLength(3)
    expect(new Set(steps.map((s) => s.visual)).size).toBe(3)
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
