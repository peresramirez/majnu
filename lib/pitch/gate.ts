// The password gate in front of the pitch deck at /pitch (issue #76).
//
// It is a light gate, not a secret: the password is the site's own domain,
// chosen by the developer so the deck is not public while the hackathon runs.
// What it protects is that the deck's text never reaches a browser before the
// password is right. The page renders only the password screen until the
// cookie set here is present (app/(pitch)/pitch/page.tsx).
//
// The plain password is in no file: only its SHA-256 is. The cookie's value is
// derived from that hash, so changing the password (and with it the hash)
// locks out every cookie handed out before.
import "server-only"

// SHA-256 of the password after normalisePassword(). To change the password:
//   printf '%s' 'new password' | shasum -a 256
export const PITCH_PASSWORD_SHA256 = "27fd4464f31c5d8a8aa3cdeb6427df59584cfc93252879d507d87af80c7779da"

export const PITCH_COOKIE = "majnu_pitch"

// Scoped to the deck: the cookie is sent only to /pitch and /pitch/unlock.
export const PITCH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/pitch",
  maxAge: 60 * 60 * 24 * 30,
} as const

// Longer input than this is refused before hashing.
const MAX_PASSWORD_LENGTH = 200

// Phones capitalise the first letter and keyboards add spaces; the password
// is a domain name, where case means nothing, so both are ignored.
export function normalisePassword(input: string): string {
  return input.trim().toLowerCase()
}

const encoder = new TextEncoder()

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)))
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

// Compares every byte, with no early exit, so the time taken says nothing
// about how much of the input was right. A length difference counts as a
// difference but does not shorten the loop.
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

// Whether a submitted password is the deck's password.
export async function passwordMatches(input: unknown, expectedHash: string = PITCH_PASSWORD_SHA256): Promise<boolean> {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_PASSWORD_LENGTH) return false
  return constantTimeEqual(await sha256(normalisePassword(input)), fromHex(expectedHash))
}

// The cookie's value: a hash of the password hash under a label of its own,
// so the cookie is not the password hash itself.
export async function pitchCookieValue(passwordHash: string = PITCH_PASSWORD_SHA256): Promise<string> {
  return toHex(await sha256(`majnu-pitch-cookie/v1:${passwordHash}`))
}

// Whether the request's cookie unlocks the deck.
export async function isUnlocked(cookie: string | undefined, passwordHash: string = PITCH_PASSWORD_SHA256): Promise<boolean> {
  if (!cookie) return false
  return constantTimeEqual(encoder.encode(cookie), encoder.encode(await pitchCookieValue(passwordHash)))
}
