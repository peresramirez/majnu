// How the deck turns keys, clicks, swipes and the hash into slides
// (lib/pitch/navigation.ts), and the middleware leaving /pitch alone.
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { config } from "@/middleware"
import { clickAction, formatClock, hashForSlide, keyAction, slideFromHash, swipeAction } from "@/lib/pitch/navigation"

describe("keyAction", () => {
  it("moves on with →, ↓, Space and PageDown, and back with ←, ↑, Shift+Space and PageUp", () => {
    for (const key of ["ArrowRight", "ArrowDown", "PageDown", " "]) expect(keyAction(key), key).toBe("next")
    for (const key of ["ArrowLeft", "ArrowUp", "PageUp"]) expect(keyAction(key), key).toBe("prev")
    expect(keyAction(" ", true)).toBe("prev")
  })

  it("jumps with Home and End, and toggles fullscreen with F and the notes with N", () => {
    expect(keyAction("Home")).toBe("first")
    expect(keyAction("End")).toBe("last")
    expect(keyAction("f")).toBe("fullscreen")
    expect(keyAction("F")).toBe("fullscreen")
    expect(keyAction("n")).toBe("notes")
    expect(keyAction("N")).toBe("notes")
  })

  it("ignores every other key", () => {
    for (const key of ["a", "Enter", "Escape", "Tab", "1"]) expect(keyAction(key), key).toBeNull()
  })
})

describe("clickAction", () => {
  it("goes back on the left part of the screen and forward anywhere else", () => {
    expect(clickAction(0, 1000)).toBe("prev")
    expect(clickAction(340, 1000)).toBe("prev")
    expect(clickAction(360, 1000)).toBe("next")
    expect(clickAction(999, 1000)).toBe("next")
  })
})

describe("swipeAction", () => {
  it("goes forward on a swipe to the left and back on a swipe to the right", () => {
    expect(swipeAction(-120, 10)).toBe("next")
    expect(swipeAction(120, -10)).toBe("prev")
  })

  it("ignores taps, short moves and scrolls", () => {
    expect(swipeAction(0, 0)).toBeNull()
    expect(swipeAction(-30, 0)).toBeNull()
    expect(swipeAction(-80, 120)).toBeNull()
  })
})

describe("the hash", () => {
  it("opens the slide it names, counting from 1", () => {
    expect(slideFromHash("#5", 9)).toBe(4)
    expect(slideFromHash("#1", 9)).toBe(0)
    expect(hashForSlide(4)).toBe("#5")
  })

  it("keeps numbers past either end on the deck and ignores anything else", () => {
    expect(slideFromHash("#0", 9)).toBe(0)
    expect(slideFromHash("#42", 9)).toBe(8)
    for (const hash of ["", "#", "#five", "#5a", "#-1", "#2.5"]) expect(slideFromHash(hash, 9), hash).toBeNull()
  })
})

describe("formatClock", () => {
  it("shows minutes and seconds", () => {
    expect(formatClock(0)).toBe("0:00")
    expect(formatClock(9_400)).toBe("0:09")
    expect(formatClock(125_000)).toBe("2:05")
    expect(formatClock(-5)).toBe("0:00")
  })
})

describe("the middleware", () => {
  it("leaves the deck and its unlock route alone, so they never touch a Supabase session", () => {
    expect(unstable_doesMiddlewareMatch({ config, url: "/pitch" })).toBe(false)
    expect(unstable_doesMiddlewareMatch({ config, url: "/pitch/unlock" })).toBe(false)
  })

  it("still runs for every other page, including ones that only start with pitch", () => {
    expect(unstable_doesMiddlewareMatch({ config, url: "/dashboard" })).toBe(true)
    expect(unstable_doesMiddlewareMatch({ config, url: "/pitchfork" })).toBe(true)
    expect(unstable_doesMiddlewareMatch({ config, url: "/" })).toBe(true)
  })
})
