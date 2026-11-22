// Checks the signature Supabase Auth puts on every Send Email hook call. The
// hook follows the Standard Webhooks scheme (https://www.standardwebhooks.com):
//
//   webhook-id:        msg_...
//   webhook-timestamp: seconds since 1970
//   webhook-signature: v1,<base64 HMAC-SHA256 of "<id>.<timestamp>.<body>">
//
// The key is the base64 part of the hook secret ("v1,whsec_<base64>"), decoded.
// A request is accepted only when one of its v1 signatures matches, compared in
// constant time, and its timestamp is within five minutes of now, so a captured
// request cannot be replayed later. Web Crypto only, so this runs the same on
// the Worker, in `next dev` and in tests.

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60

export type WebhookHeaders = { id: string | null; timestamp: string | null; signature: string | null }

export type WebhookCheck =
  | { ok: true }
  | { ok: false; reason: "missing_headers" | "bad_secret" | "stale_timestamp" | "bad_signature" }

// "v1,whsec_<base64>" (as Supabase shows it), "whsec_<base64>" or the bare
// base64 all give the same key. Anything else is refused.
export function hookSecretKey(secret: string | undefined): Uint8Array | null {
  if (!secret) return null
  const base64 = secret.trim().replace(/^v1,/, "").replace(/^whsec_/, "")
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null
  try {
    const key = base64ToBytes(base64)
    return key.length >= 16 ? key : null
  } catch {
    return null
  }
}

export function webhookHeaders(headers: Headers): WebhookHeaders {
  return {
    id: headers.get("webhook-id"),
    timestamp: headers.get("webhook-timestamp"),
    signature: headers.get("webhook-signature"),
  }
}

export async function verifyWebhook(
  secret: string | undefined,
  headers: WebhookHeaders,
  body: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<WebhookCheck> {
  const key = hookSecretKey(secret)
  if (!key) return { ok: false, reason: "bad_secret" }
  const { id, timestamp, signature } = headers
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing_headers" }

  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "stale_timestamp" }
  if (Math.abs(nowSeconds - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: "stale_timestamp" }

  const expected = await sign(key, `${id}.${timestamp}.${body}`)
  // Several signatures may be sent, separated by spaces, while a secret is rotated.
  let matched = false
  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",", 2)
    if (version !== "v1" || !value) continue
    let given: Uint8Array
    try {
      given = base64ToBytes(value)
    } catch {
      continue
    }
    // No early exit: every candidate is compared the same way.
    if (constantTimeEqual(given, expected)) matched = true
  }
  return matched ? { ok: true } : { ok: false, reason: "bad_signature" }
}

// Used by the tests and by anyone reproducing a hook call by hand.
export async function signWebhook(secret: string, id: string, timestamp: number, body: string): Promise<string> {
  const key = hookSecretKey(secret)
  if (!key) throw new Error("Invalid hook secret")
  return `v1,${bytesToBase64(await sign(key, `${id}.${timestamp}.${body}`))}`
}

async function sign(key: Uint8Array, content: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(content)))
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  // The lengths are public (a SHA-256 MAC is always 32 bytes); the bytes are not.
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
