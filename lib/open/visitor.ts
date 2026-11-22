// The anonymous visitor id for open tracking (docs/plan.md, "Open tracking").
//
// A keyed SHA-256 (HMAC) of the letter id, the visitor's IP address and user
// agent, under OPEN_HASH_SECRET. Nothing is stored on the visitor's device and
// the IP address is never saved: without the secret, the id cannot be traced
// back to an address. If open tracking changes, change /privacy in the same commit.
// Uses Web Crypto, which Workers and Node both provide.

export async function visitorId(input: { letterId: string; ip: string; userAgent: string; secret: string }): Promise<string> {
  // Hashing an IP address without a secret would be reversible by trying every address.
  if (!input.secret) throw new Error("OPEN_HASH_SECRET is not set")
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", encoder.encode(input.secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ])
  // JSON keeps the fields apart, so ("a", "bc") and ("ab", "c") cannot collide.
  const message = encoder.encode(JSON.stringify([input.letterId, input.ip, input.userAgent]))
  const digest = await crypto.subtle.sign("HMAC", key, message)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

// The visitor's IP address: Cloudflare's header, then the first X-Forwarded-For
// entry (local development and other proxies). Empty if neither is present.
export function clientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim()
  if (cf) return cf
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? ""
}
