import { describe, expect, it } from "vitest"
import { CARD_HEIGHT, CARD_WIDTH, cameraDistance, FOV, presentDistance, wrapLines } from "@/components/letters/templates/gift-box-3d/layout"

const tanHalf = Math.tan(((FOV / 2) * Math.PI) / 180)
// Share of the view's height and width the card takes at a given distance.
const share = (distance: number, aspect: number) => ({
  height: CARD_HEIGHT / (2 * distance * tanHalf),
  width: CARD_WIDTH / (2 * distance * tanHalf * aspect),
})

describe("cameraDistance", () => {
  it("keeps the nearest distance on wide screens", () => {
    expect(cameraDistance(16 / 9)).toBe(cameraDistance(1.2))
  })
  it("steps back on tall phone screens so the box fits across", () => {
    expect(cameraDistance(375 / 740)).toBeGreaterThan(cameraDistance(1.2))
    expect(cameraDistance(0.4)).toBeGreaterThan(cameraDistance(0.5))
  })
  it("treats a broken aspect ratio as square instead of dividing by zero", () => {
    expect(cameraDistance(0)).toBe(cameraDistance(1))
    expect(cameraDistance(Number.NaN)).toBe(cameraDistance(1))
  })
})

describe("presentDistance", () => {
  it.each([375 / 740, 0.9, 1, 1440 / 900, 2.4])("keeps the card inside the view at aspect %f", (aspect) => {
    const s = share(presentDistance(aspect), aspect)
    expect(s.height).toBeLessThanOrEqual(0.8 + 1e-9)
    expect(s.width).toBeLessThanOrEqual(0.86 + 1e-9)
    // ...and as large as those limits allow.
    expect(Math.max(s.height / 0.8, s.width / 0.86)).toBeCloseTo(1, 6)
  })
})

describe("wrapLines", () => {
  // One unit per character, so widths are easy to reason about.
  const measure = (s: string) => s.length

  it("wraps on spaces without going over the width", () => {
    expect(wrapLines("Five years of us and counting", 12, measure)).toEqual(["Five years", "of us and", "counting"])
  })
  it("keeps a word longer than the line whole", () => {
    expect(wrapLines("Supercalifragilistic day", 10, measure)).toEqual(["Supercalifragilistic", "day"])
  })
  it("ends the last allowed line with an ellipsis", () => {
    const lines = wrapLines("one two three four five six seven", 9, measure, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith("…")).toBe(true)
    expect(measure(lines[1])).toBeLessThanOrEqual(9)
  })
  it("returns nothing for empty text", () => {
    expect(wrapLines("   ", 10, measure)).toEqual([])
  })
})
