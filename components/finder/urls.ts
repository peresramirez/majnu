// Links and images in gift options come from shops via the research agent, so
// only safe ones are used: https links, and https or same-site images.

// A shop link, or null when it is not https (javascript:, data:, plain http).
export function shopHref(url: string | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}

// A product image: https, or a path on this site (used by /dev/finder).
export function productImageSrc(url: string | undefined): string | null {
  if (!url) return null
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) return url
  return shopHref(url)
}

// "thalia.de" from a shop link, for options that name no shop.
export function shopName(option: { shop?: string; url: string }): string | null {
  if (option.shop?.trim()) return option.shop.trim()
  try {
    return new URL(option.url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

// Majnu's own gift pictures (made with FLUX), for a gift without a usable shop
// photo. The same seed always gives the same picture.
export const DEFAULT_GIFT_IMAGES = ["/finder/gift-default-1.jpg", "/finder/gift-default-2.jpg", "/finder/gift-default-3.jpg"] as const

export function defaultGiftImage(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return DEFAULT_GIFT_IMAGES[hash % DEFAULT_GIFT_IMAGES.length]
}
