// The pitch deck's password gate (lib/pitch/gate.ts): the password check, the
// constant-time comparison and the cookie derived from the password's hash.
import { createHash } from "node:crypto"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  PITCH_COOKIE_OPTIONS,
  PITCH_PASSWORD_SHA256,
  constantTimeEqual,
  isUnlocked,
  normalisePassword,
  passwordMatches,
  pitchCookieValue,
} from "@/lib/pitch/gate"

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")

describe("the stored password", () => {
  it("is the SHA-256 of the domain name, never the password itself", () => {
    expect(PITCH_PASSWORD_SHA256).toBe(sha256("majnu.app"))
    expect(PITCH_PASSWORD_SHA256).not.toContain("majnu")
  })
})

describe("passwordMatches", () => {
  it("accepts the password", async () => {
    expect(await passwordMatches("majnu.app")).toBe(true)
  })

  it("accepts it as a phone types it: capitalised, with a space", async () => {
    expect(normalisePassword("  Majnu.App ")).toBe("majnu.app")
    expect(await passwordMatches("Majnu.app ")).toBe(true)
  })

  it("refuses anything else", async () => {
    for (const wrong of ["", "majnu", "majnu.ap", "majnu.app.", "layla.ai", "MAJNU APP", PITCH_PASSWORD_SHA256]) {
      expect(await passwordMatches(wrong), wrong).toBe(false)
    }
  })

  it("refuses what is not a string, and very long input without hashing it", async () => {
    for (const wrong of [undefined, null, 42, ["majnu.app"], { password: "majnu.app" }]) {
      expect(await passwordMatches(wrong)).toBe(false)
    }
    const digest = vi.spyOn(crypto.subtle, "digest")
    expect(await passwordMatches("majnu.app" + " ".repeat(300))).toBe(false)
    expect(digest).not.toHaveBeenCalled()
    digest.mockRestore()
  })

  it("follows the stored hash, so a new password replaces the old one", async () => {
    const other = sha256("another password")
    expect(await passwordMatches("another password", other)).toBe(true)
    expect(await passwordMatches("majnu.app", other)).toBe(false)
  })
})

describe("constantTimeEqual", () => {
  it("compares byte arrays", () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false)
    expect(constantTimeEqual(new Uint8Array([]), new Uint8Array([]))).toBe(true)
  })

  // Counts every byte read: an early exit on the first difference would read one.
  function counting(bytes: number[]) {
    const reads = new Set<number>()
    const array = new Proxy(new Uint8Array(bytes), {
      get(target, key) {
        if (typeof key === "string" && /^\d+$/.test(key)) reads.add(Number(key))
        const value = Reflect.get(target, key, target)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    return { array, reads }
  }

  it("reads every byte even when the first one differs", () => {
    const expected = new Uint8Array(32).fill(7)
    const { array, reads } = counting([0, ...new Array(31).fill(7)])
    expect(constantTimeEqual(array, expected)).toBe(false)
    expect(reads.size).toBe(32)
  })

  it("reads every byte of the longer input when the lengths differ", () => {
    const { array, reads } = counting(new Array(40).fill(7))
    expect(constantTimeEqual(array, new Uint8Array(32).fill(7))).toBe(false)
    expect(reads.size).toBe(40)
  })
})

describe("the cookie", () => {
  it("is derived from the password's hash, and is not the hash itself", async () => {
    const value = await pitchCookieValue()
    expect(value).toMatch(/^[0-9a-f]{64}$/)
    expect(value).toBe(sha256(`majnu-pitch-cookie/v1:${PITCH_PASSWORD_SHA256}`))
    expect(value).not.toBe(PITCH_PASSWORD_SHA256)
  })

  it("unlocks the deck only with the right value", async () => {
    const value = await pitchCookieValue()
    expect(await isUnlocked(value)).toBe(true)
    expect(await isUnlocked(undefined)).toBe(false)
    expect(await isUnlocked("")).toBe(false)
    expect(await isUnlocked(PITCH_PASSWORD_SHA256)).toBe(false)
    expect(await isUnlocked(value.slice(0, 63) + (value.endsWith("0") ? "1" : "0"))).toBe(false)
    expect(await isUnlocked(value + "0")).toBe(false)
  })

  it("locks out every old cookie when the password changes", async () => {
    const old = await pitchCookieValue()
    const newHash = sha256("a new password")
    expect(await isUnlocked(old, newHash)).toBe(false)
    expect(await isUnlocked(await pitchCookieValue(newHash), newHash)).toBe(true)
  })

  it("is HttpOnly, Secure, SameSite=Lax, scoped to /pitch, for 30 days", () => {
    expect(PITCH_COOKIE_OPTIONS).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/pitch",
      maxAge: 30 * 24 * 60 * 60,
    })
  })
})
