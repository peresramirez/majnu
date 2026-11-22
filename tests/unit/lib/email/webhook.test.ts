// The Send Email hook's signature check (Standard Webhooks, as Supabase signs it).
import { describe, expect, it } from "vitest"
import { hookSecretKey, signWebhook, verifyWebhook, WEBHOOK_TOLERANCE_SECONDS } from "@/lib/email/webhook"

// Test secrets only: 32 random-looking bytes, base64.
const SECRET = "v1,whsec_dGVzdC1zZWNyZXQtZm9yLW1ham51LWhvb2stMDEyMzQ1Njc4OQ=="
const OTHER = "v1,whsec_b3RoZXItc2VjcmV0LWZvci1tYWpudS1ob29rLTAxMjM0NTY3ODk="
const NOW = 1_795_000_000
const BODY = JSON.stringify({ user: { email: "anna@example.com" }, email_data: { email_action_type: "magiclink" } })

async function headers(secret = SECRET, timestamp = NOW, body = BODY) {
  return { id: "msg_1", timestamp: String(timestamp), signature: await signWebhook(secret, "msg_1", timestamp, body) }
}

describe("verifyWebhook", () => {
  it("accepts a request signed with the hook secret", async () => {
    expect(await verifyWebhook(SECRET, await headers(), BODY, NOW)).toEqual({ ok: true })
  })

  it("accepts the secret with or without its v1,whsec_ prefix", async () => {
    const h = await headers()
    expect(await verifyWebhook(SECRET.replace("v1,whsec_", ""), h, BODY, NOW)).toEqual({ ok: true })
    expect(await verifyWebhook(SECRET.replace("v1,", ""), h, BODY, NOW)).toEqual({ ok: true })
  })

  it("accepts when one of several signatures matches (secret rotation)", async () => {
    const good = await headers()
    const bad = await headers(OTHER)
    expect(await verifyWebhook(SECRET, { ...good, signature: `${bad.signature} ${good.signature}` }, BODY, NOW)).toEqual({ ok: true })
  })

  it("rejects a request signed with another secret", async () => {
    expect(await verifyWebhook(SECRET, await headers(OTHER), BODY, NOW)).toEqual({ ok: false, reason: "bad_signature" })
  })

  it("rejects a tampered body", async () => {
    const tampered = BODY.replace("anna@example.com", "mallory@example.com")
    expect(await verifyWebhook(SECRET, await headers(), tampered, NOW)).toEqual({ ok: false, reason: "bad_signature" })
  })

  it("rejects a stale or future timestamp, even when correctly signed", async () => {
    const old = NOW - WEBHOOK_TOLERANCE_SECONDS - 1
    expect(await verifyWebhook(SECRET, await headers(SECRET, old), BODY, NOW)).toEqual({ ok: false, reason: "stale_timestamp" })
    const future = NOW + WEBHOOK_TOLERANCE_SECONDS + 1
    expect(await verifyWebhook(SECRET, await headers(SECRET, future), BODY, NOW)).toEqual({ ok: false, reason: "stale_timestamp" })
    expect(await verifyWebhook(SECRET, await headers(SECRET, NOW - 60), BODY, NOW)).toEqual({ ok: true })
  })

  it("rejects a timestamp changed after signing", async () => {
    const h = await headers()
    expect(await verifyWebhook(SECRET, { ...h, timestamp: String(NOW - 1) }, BODY, NOW)).toEqual({ ok: false, reason: "bad_signature" })
  })

  it("rejects unsigned requests and garbage signatures", async () => {
    expect(await verifyWebhook(SECRET, { id: null, timestamp: null, signature: null }, BODY, NOW)).toEqual({ ok: false, reason: "missing_headers" })
    const h = await headers()
    expect(await verifyWebhook(SECRET, { ...h, signature: "v1,not base64!" }, BODY, NOW)).toEqual({ ok: false, reason: "bad_signature" })
    expect(await verifyWebhook(SECRET, { ...h, signature: h.signature.replace("v1,", "v2,") }, BODY, NOW)).toEqual({ ok: false, reason: "bad_signature" })
  })

  it("refuses to run without a usable secret", async () => {
    const h = await headers()
    expect(await verifyWebhook(undefined, h, BODY, NOW)).toEqual({ ok: false, reason: "bad_secret" })
    expect(await verifyWebhook("", h, BODY, NOW)).toEqual({ ok: false, reason: "bad_secret" })
    expect(hookSecretKey("v1,whsec_c2hvcnQ=")).toBeNull()
  })
})
