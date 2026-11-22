import { describe, expect, it } from "vitest"
import { DEFAULT_GIFT_IMAGES, defaultGiftImage, productImageSrc, shopHref, shopName } from "@/components/finder/urls"

describe("finder urls", () => {
  it("links only to https shop pages", () => {
    expect(shopHref("https://www.thalia.de/p/1")).toBe("https://www.thalia.de/p/1")
    expect(shopHref("http://shop.example/p")).toBeNull()
    expect(shopHref("javascript:alert(1)")).toBeNull()
    expect(shopHref("not a url")).toBeNull()
    expect(shopHref(undefined)).toBeNull()
  })

  it("shows https images and images from this site only", () => {
    expect(productImageSrc("https://img.example/a.jpg")).toBe("https://img.example/a.jpg")
    expect(productImageSrc("/landing/a.webp")).toBe("/landing/a.webp")
    expect(productImageSrc("//evil.example/a.jpg")).toBeNull()
    expect(productImageSrc("/\\evil.example/a.jpg")).toBeNull()
    expect(productImageSrc("data:image/png;base64,AAAA")).toBeNull()
    expect(productImageSrc("http://img.example/a.jpg")).toBeNull()
  })

  it("names the shop, or its domain when no shop is given", () => {
    expect(shopName({ shop: " Thalia ", url: "https://www.thalia.de/p" })).toBe("Thalia")
    expect(shopName({ url: "https://www.thalia.de/p" })).toBe("thalia.de")
    expect(shopName({ url: "nope" })).toBeNull()
  })
})

describe("defaultGiftImage", () => {
  it("picks one of Majnu's own pictures, the same one for the same gift", () => {
    expect(DEFAULT_GIFT_IMAGES).toContain(defaultGiftImage("Engraved cookie jar"))
    expect(defaultGiftImage("Engraved cookie jar")).toBe(defaultGiftImage("Engraved cookie jar"))
    const picks = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(defaultGiftImage))
    expect(picks.size).toBeGreaterThan(1)
  })
})
