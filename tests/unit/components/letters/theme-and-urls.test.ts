import { describe, expect, it } from "vitest"
import { fontOf, fonts, paletteOf, palettes, themeStyle } from "@/components/letters/theme"
import { safeHttps } from "@/components/letters/urls"
import { Font, Palette } from "@/lib/letters/schema"

describe("theme", () => {
  it("defines every palette and font in the contract", () => {
    expect(Object.keys(palettes).sort()).toEqual([...Palette.options].sort())
    expect(Object.keys(fonts).sort()).toEqual([...Font.options].sort())
  })
  it("gives every palette the same set of tokens", () => {
    const keys = Object.keys(palettes.night).sort()
    for (const p of Object.values(palettes)) expect(Object.keys(p).sort()).toEqual(keys)
  })
  it("falls back to night and serif for unknown moods", () => {
    expect(paletteOf({ palette: "neon" as never, font: "serif" })).toBe(palettes.night)
    expect(fontOf(undefined)).toBe(fonts.serif)
  })
  it("exposes the moods as CSS variables", () => {
    const style = themeStyle({ palette: "sage", font: "script" }) as Record<string, string>
    expect(style["--paper"]).toBe(palettes.sage.paper)
    expect(style["--display"]).toBe(fonts.script.display)
  })
})

describe("safeHttps", () => {
  it("allows https only", () => {
    expect(safeHttps("https://example.com/redeem")).toBe("https://example.com/redeem")
    expect(safeHttps("http://example.com")).toBeNull()
    expect(safeHttps("javascript:alert(1)")).toBeNull()
    expect(safeHttps("data:text/html,hi")).toBeNull()
    expect(safeHttps("not a url")).toBeNull()
    expect(safeHttps(undefined)).toBeNull()
  })
})
