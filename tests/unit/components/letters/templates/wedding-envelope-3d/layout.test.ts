import { describe, expect, it } from "vitest"
import { parseEventStart } from "@/components/letters/event-time"
import {
  CARD_HEIGHT,
  CARD_TUCKED_SCALE,
  CARD_WIDTH,
  cardWords,
  coupleNames,
  ENVELOPE_HEIGHT,
  ENVELOPE_WIDTH,
  envelopeCameraDistance,
  presentDistance,
  SEAL_CRACK,
  sealHalves,
  svgPath,
  viewHalfSize,
  waxOutline,
  type Point,
} from "@/components/letters/templates/wedding-envelope-3d/layout"
import { letterFixtures } from "@/lib/letters/fixtures"

const PHONE = 375 / 740
const DESKTOP = 1440 / 900

function area(points: Point[]): number {
  let sum = 0
  points.forEach(([x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length]
    sum += x * ny - nx * y
  })
  return sum / 2
}

describe("envelope framing", () => {
  it.each([
    ["phone", PHONE],
    ["square", 1],
    ["desktop", DESKTOP],
  ])("keeps the whole envelope in view with air at the sides on a %s", (_, aspect) => {
    const { halfWidth, halfHeight } = viewHalfSize(envelopeCameraDistance(aspect), aspect)
    expect(ENVELOPE_WIDTH / 2).toBeLessThan(halfWidth * 0.8)
    expect(ENVELOPE_HEIGHT / 2).toBeLessThan(halfHeight * 0.5)
  })

  it("stands further back on a tall phone than on a wide screen", () => {
    expect(envelopeCameraDistance(PHONE)).toBeGreaterThan(envelopeCameraDistance(DESKTOP))
    expect(envelopeCameraDistance(DESKTOP)).toBe(5.6)
  })

  it("survives a zero or broken aspect", () => {
    expect(Number.isFinite(envelopeCameraDistance(0))).toBe(true)
    expect(Number.isFinite(envelopeCameraDistance(Number.NaN))).toBe(true)
  })

  it("presents the card inside the view on a phone and a desktop", () => {
    for (const aspect of [PHONE, DESKTOP]) {
      const { halfWidth, halfHeight } = viewHalfSize(presentDistance(aspect), aspect)
      expect(CARD_WIDTH / 2).toBeLessThanOrEqual(halfWidth * 0.86 + 1e-9)
      expect(CARD_HEIGHT / 2).toBeLessThanOrEqual(halfHeight * 0.8 + 1e-9)
    }
  })

  it("fits the tucked card inside the envelope", () => {
    expect(CARD_WIDTH * CARD_TUCKED_SCALE).toBeLessThan(ENVELOPE_WIDTH)
    expect(CARD_HEIGHT * CARD_TUCKED_SCALE).toBeLessThan(ENVELOPE_HEIGHT)
  })
})

describe("the wax seal", () => {
  it("has a closed, roughly round edge", () => {
    const edge = waxOutline()
    expect(edge.length).toBeGreaterThan(30)
    for (const [x, y] of edge) expect(Math.hypot(x, y)).toBeGreaterThan(0.85)
    for (const [x, y] of edge) expect(Math.hypot(x, y)).toBeLessThan(1.15)
    expect(edge[0][0]).toBeCloseTo(0, 6)
    expect(edge[0][1]).toBeGreaterThan(0)
  })

  it("cracks along a line inside the seal", () => {
    for (const [x, y] of SEAL_CRACK) expect(Math.hypot(x, y)).toBeLessThan(0.9)
  })

  it("breaks into two halves that cover it exactly", () => {
    const { left, right } = sealHalves()
    expect(area(left)).toBeGreaterThan(0)
    expect(area(right)).toBeGreaterThan(0)
    expect(area(left) + area(right)).toBeCloseTo(area(waxOutline()), 9)
    // The left half lies left of the crack, the right half right of it.
    expect(Math.min(...left.map(([x]) => x))).toBeLessThan(-0.85)
    expect(Math.max(...right.map(([x]) => x))).toBeGreaterThan(0.85)
  })

  it("draws as an SVG path with y pointing down", () => {
    expect(svgPath([[0, 1], [1, 0], [0, -1]], 50, 50, 10)).toBe("M50.00 40.00 L60.00 50.00 L50.00 60.00 Z")
  })
})

describe("the card's words", () => {
  it("writes a couple as a wedding card does", () => {
    expect(coupleNames("Layla and Omar")).toBe("Layla & Omar")
    expect(coupleNames("Clara  &  Ben")).toBe("Clara & Ben")
    expect(coupleNames("Ana y Luis")).toBe("Ana & Luis")
    expect(coupleNames("Mia")).toBe("Mia")
    expect(coupleNames("  ")).toBe("")
    expect(coupleNames(undefined)).toBe("")
  })

  it("carries the names, headline, date and place from the fixture, never a code", () => {
    const content = letterFixtures["wedding-envelope-3d"]
    const words = cardWords(content, parseEventStart(content.event?.startsAt))
    expect(words).toEqual({
      eyebrow: "For Zara",
      names: "Layla & Omar",
      headline: "Request the pleasure of your company",
      weekday: "Saturday",
      date: "13 February 2027",
      time: "6 pm",
      place: "The Rose Garden Pavilion",
    })
  })

  it("leaves the date lines empty without an event", () => {
    const { event: _event, ...content } = letterFixtures["wedding-envelope-3d"]
    const words = cardWords(content, null)
    expect(words.date).toBe("")
    expect(words.place).toBe("")
    expect(words.names).toBe("Layla & Omar")
  })
})
