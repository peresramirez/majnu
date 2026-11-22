// Coupon codes for the personalised wrapper (docs/features/coupons.md): how a
// code looks, how one is made, and the hash the database stores instead of it.
//
// Pure and without `server-only` on purpose: the server (./coupons.ts) and the
// command line (scripts/coupon.ts, run with plain Node) must normalise and hash
// a code in exactly the same way, so both import this file. It holds no secret:
// a code is only worth something when its hash is in the coupons table.
// Relative imports only, so Node can load it without the "@/" alias.

// 23 characters with no look-alikes, so a code read aloud or copied from a
// screenshot is typed right: no 0/O, 1/I/L, 2/Z, 5/S, 8/B or U/V.
export const COUPON_ALPHABET = "34679ACDEFGHJKMNPQRTWXY"

// 16 characters, about 72 bits: far too many to find a code by trying.
export const COUPON_LENGTH = 16

// Shown in groups of four: "K7QM-3XRA-PD9C-WHTE".
const GROUP = 4

// A code the developer chooses to print (`npm run coupon -- create --code
// LAYLA100`): 6 to 24 letters and digits once normalised. Such a code is meant
// to be public, so it is limited by its uses and one use per person, not by
// being hard to guess.
export const CHOSEN_MIN_LENGTH = 6
export const CHOSEN_MAX_LENGTH = 24

// What a typed code may be after normalising: a random one (16 characters) or
// a chosen one. Anything else is refused without asking the database.
const NORMALISED = new RegExp(`^[0-9A-Z]{${CHOSEN_MIN_LENGTH},${CHOSEN_MAX_LENGTH}}$`)

// A new random code, grouped for reading. Rejection sampling keeps every
// character equally likely (256 is not a multiple of 23).
export function generateCouponCode(): string {
  const limit = 256 - (256 % COUPON_ALPHABET.length)
  let code = ""
  while (code.length < COUPON_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(COUPON_LENGTH * 2))) {
      if (byte < limit && code.length < COUPON_LENGTH) code += COUPON_ALPHABET[byte % COUPON_ALPHABET.length]
    }
  }
  return formatCouponCode(code)
}

export function formatCouponCode(normalised: string): string {
  return normalised.match(new RegExp(`.{1,${GROUP}}`, "g"))?.join("-") ?? normalised
}

// The code as it is hashed: upper case, with spaces, dashes and underscores
// removed (people type "k7qm 3xra-pd9c_whte" too). Full-width characters from
// a phone keyboard become plain ones (NFKC). Null when what is left cannot be
// a code.
export function normaliseCouponCode(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 200) return null
  const code = value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s\-‐-―−_]/g, "")
  return NORMALISED.test(code) ? code : null
}

// SHA-256 of the normalised code, lower-case hex: what coupons.code_hash holds.
// Web Crypto, so it runs the same on Workers and in Node.
export async function hashCouponCode(normalised: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalised))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}
