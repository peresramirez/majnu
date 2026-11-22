// How coupon codes look, are made and are hashed (lib/billing/coupon-code.ts).
// The server and `npm run coupon` share this file, so a code created on the
// command line is found by the redeem route.
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { CHOSEN_MAX_LENGTH, CHOSEN_MIN_LENGTH, COUPON_ALPHABET, COUPON_LENGTH, formatCouponCode, generateCouponCode, hashCouponCode, normaliseCouponCode } from "@/lib/billing/coupon-code"

describe("the alphabet", () => {
  it("has no look-alikes and no duplicates", () => {
    for (const c of "0O1IL2Z5S8BUV") expect(COUPON_ALPHABET).not.toContain(c)
    expect(new Set(COUPON_ALPHABET).size).toBe(COUPON_ALPHABET.length)
    expect(COUPON_ALPHABET).toMatch(/^[0-9A-Z]+$/)
  })

  it("gives codes of at least 70 bits", () => {
    expect(COUPON_LENGTH).toBeGreaterThanOrEqual(12)
    expect(COUPON_LENGTH * Math.log2(COUPON_ALPHABET.length)).toBeGreaterThan(70)
  })
})

describe("generateCouponCode", () => {
  it("makes 16 characters from the alphabet in groups of four", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCouponCode()
      expect(code).toMatch(/^[34679ACDEFGHJKMNPQRTWXY]{4}(-[34679ACDEFGHJKMNPQRTWXY]{4}){3}$/)
      expect(normaliseCouponCode(code)).toHaveLength(COUPON_LENGTH)
    }
  })

  it("does not repeat itself and uses the whole alphabet", () => {
    const codes = Array.from({ length: 500 }, generateCouponCode)
    expect(new Set(codes).size).toBe(codes.length)
    const seen = new Set(codes.join("").replace(/-/g, ""))
    expect(seen.size).toBe(COUPON_ALPHABET.length)
  })
})

describe("normaliseCouponCode", () => {
  it("ignores case, spaces, dashes and underscores", () => {
    const canonical = "K7QM3XRAPD9CWHTE"
    for (const typed of ["K7QM-3XRA-PD9C-WHTE", "k7qm 3xra pd9c whte", " k7qm_3xra-pd9c whte ", "K7QM–3XRA—PD9C−WHTE", "k7qm3xrapd9cwhte"]) {
      expect(normaliseCouponCode(typed)).toBe(canonical)
    }
  })

  it("turns full-width characters from a phone keyboard into plain ones", () => {
    expect(normaliseCouponCode("Ｋ７ＱＭ-3XRA-PD9C-WHTE")).toBe("K7QM3XRAPD9CWHTE")
  })

  it("refuses what cannot be a code", () => {
    for (const value of ["", "   ", "SHORT", "ABC-12", "K7QM-3XRA-PD9C-WH!E", "K7QM.3XRA.PD9C.WHTE", "A".repeat(25), "x".repeat(201), "Ä7QM3XRAPD9CWHTE", null, undefined, 1234567890123, {}]) {
      expect(normaliseCouponCode(value)).toBeNull()
    }
  })

  it("accepts a chosen code of 6 to 24 letters and digits, as printed on a poster", () => {
    expect(CHOSEN_MIN_LENGTH).toBe(6)
    expect(CHOSEN_MAX_LENGTH).toBe(24)
    expect(normaliseCouponCode("LAYLA100")).toBe("LAYLA100")
    expect(normaliseCouponCode("layla 100")).toBe("LAYLA100")
    expect(normaliseCouponCode("Layla-100")).toBe("LAYLA100")
    expect(normaliseCouponCode("ABC123")).toBe("ABC123")
    expect(normaliseCouponCode("A".repeat(24))).toBe("A".repeat(24))
    expect(normaliseCouponCode("launch-test-2026")).toBe("LAUNCHTEST2026")
  })
})

describe("hashCouponCode", () => {
  it("is the SHA-256 hex of the normalised code, as the database stores it", async () => {
    const hash = await hashCouponCode("K7QM3XRAPD9CWHTE")
    expect(hash).toBe(createHash("sha256").update("K7QM3XRAPD9CWHTE").digest("hex"))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("is the same however the code was typed", async () => {
    const a = await hashCouponCode(normaliseCouponCode("k7qm 3xra pd9c whte")!)
    const b = await hashCouponCode(normaliseCouponCode("K7QM-3XRA-PD9C-WHTE")!)
    expect(a).toBe(b)
  })

  it("formats a normalised code back into groups", () => {
    expect(formatCouponCode("K7QM3XRAPD9CWHTE")).toBe("K7QM-3XRA-PD9C-WHTE")
  })
})
