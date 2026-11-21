import { describe, expect, it } from "vitest"
import { qrMatrix, qrPath, qrSvg } from "@/components/share/qr"

const url = "https://majnu.app/l/aB3dE5gH7j"

describe("qr", () => {
  it("encodes a square matrix with the three finder patterns", () => {
    const m = qrMatrix(url)
    expect(m.length).toBeGreaterThanOrEqual(21)
    expect(m.every((row) => row.length === m.length)).toBe(true)
    // Each finder pattern starts with a solid 7-module row.
    const n = m.length
    expect(m[0].slice(0, 7).every(Boolean)).toBe(true)
    expect(m[0].slice(n - 7).every(Boolean)).toBe(true)
    expect(m[n - 1].slice(0, 7).every(Boolean)).toBe(true)
  })

  it("is deterministic, so the server and the browser draw the same code", () => {
    expect(qrPath(qrMatrix(url))).toBe(qrPath(qrMatrix(url)))
  })

  it("merges runs of dark modules into one rectangle each", () => {
    expect(qrPath([[true, true, false, true]])).toBe("M0 0h2v1h-2zM3 0h1v1h-1z")
    expect(qrPath([[true]], 4)).toBe("M4 4h1v1h-1z")
  })

  it("writes a standalone SVG with a quiet zone", () => {
    const svg = qrSvg(url)
    const size = qrMatrix(url).length + 8
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain(`viewBox="0 0 ${size} ${size}"`)
    expect(svg).toContain('fill="#FFFFFF"')
  })
})
