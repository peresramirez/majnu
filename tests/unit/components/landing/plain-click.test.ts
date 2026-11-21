import { describe, expect, it } from "vitest"
import { isPlainClick, type ClickLike } from "@/components/landing/plain-click"

const click = (overrides: Partial<ClickLike> = {}): ClickLike => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  ...overrides,
})

describe("isPlainClick", () => {
  it("takes over a plain click with the main button, so the example opens in a dialog", () => {
    expect(isPlainClick(click())).toBe(true)
  })

  it("leaves new-tab and new-window clicks to the browser", () => {
    expect(isPlainClick(click({ metaKey: true }))).toBe(false)
    expect(isPlainClick(click({ ctrlKey: true }))).toBe(false)
    expect(isPlainClick(click({ shiftKey: true }))).toBe(false)
    expect(isPlainClick(click({ altKey: true }))).toBe(false)
    expect(isPlainClick(click({ button: 1 }))).toBe(false)
  })

  it("leaves a click someone else already handled", () => {
    expect(isPlainClick(click({ defaultPrevented: true }))).toBe(false)
  })
})
