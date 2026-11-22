import { describe, expect, it } from "vitest"
import { FOV, fitDistance, ramp, renderPixelRatio } from "@/components/letters/templates/three-kit/fit"

const tan = Math.tan(((FOV / 2) * Math.PI) / 180)

describe("fitDistance", () => {
  it("fits the height on wide screens and the width on tall phones", () => {
    const wide = fitDistance(1, 1, 16 / 9)
    expect(wide).toBeCloseTo(1 / tan)
    const phone = fitDistance(1, 1, 375 / 812)
    expect(phone).toBeCloseTo(1 / (tan * (375 / 812)))
    expect(phone).toBeGreaterThan(wide)
  })

  it("keeps the whole object in view at the distance it returns", () => {
    for (const aspect of [0.4, 0.46, 0.75, 1, 1.6, 2.2]) {
      const d = fitDistance(0.9, 1.6, aspect)
      expect(d * tan).toBeGreaterThanOrEqual(1.6 - 1e-9)
      expect(d * tan * aspect).toBeGreaterThanOrEqual(0.9 - 1e-9)
    }
  })

  it("never comes closer than the nearest distance and survives a bad aspect", () => {
    expect(fitDistance(0.1, 0.1, 1.5, 4)).toBe(4)
    expect(Number.isFinite(fitDistance(1, 1, Number.NaN))).toBe(true)
    expect(Number.isFinite(fitDistance(1, 1, 0))).toBe(true)
  })
})

describe("renderPixelRatio", () => {
  it("caps small screens at 1.75 and large ones at 2", () => {
    expect(renderPixelRatio(3, 375)).toBe(1.75)
    expect(renderPixelRatio(3, 1440)).toBe(2)
    expect(renderPixelRatio(1, 375)).toBe(1)
    expect(renderPixelRatio(Number.NaN, 375)).toBe(1)
  })
})

describe("ramp", () => {
  it("eases from 0 to 1 between its edges", () => {
    expect(ramp(0, 0.2, 0.8)).toBe(0)
    expect(ramp(1, 0.2, 0.8)).toBe(1)
    expect(ramp(0.5, 0.2, 0.8)).toBeCloseTo(0.5)
    expect(ramp(0.5, 0.5, 0.5)).toBe(1)
  })
})
