// POST /api/auth/send-email: signature first, then the email goes to the sender.
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { handleSendEmailHook } from "@/lib/email/hook"
import type { EmailSender } from "@/lib/email/sender"
import { signWebhook } from "@/lib/email/webhook"

const SECRET = "v1,whsec_dGVzdC1zZWNyZXQtZm9yLW1ham51LWhvb2stMDEyMzQ1Njc4OQ=="
const NOW = 1_795_000_000
const PAYLOAD = {
  user: { email: "anna@example.com" },
  email_data: {
    email_action_type: "magiclink",
    token: "305805",
    token_hash: "pkce_abc123abc123abc123",
    redirect_to: "https://majnu.app/auth/callback",
    site_url: "https://example.supabase.co/auth/v1",
    token_new: "",
    token_hash_new: "",
  },
}

async function request(body: string, opts: { secret?: string; timestamp?: number; signed?: boolean } = {}) {
  const timestamp = opts.timestamp ?? NOW
  const headers = new Headers({ "content-type": "application/json" })
  if (opts.signed !== false) {
    headers.set("webhook-id", "msg_1")
    headers.set("webhook-timestamp", String(timestamp))
    headers.set("webhook-signature", await signWebhook(opts.secret ?? SECRET, "msg_1", timestamp, body))
  }
  return new Request("https://majnu.app/api/auth/send-email", { method: "POST", headers, body })
}

function stubSender(fail = false) {
  const sent: Parameters<EmailSender["send"]>[0][] = []
  const sender: EmailSender = {
    send: vi.fn(async (email) => {
      if (fail) throw new Error("E_DELIVERY_FAILED")
      sent.push(email)
    }),
  }
  return { sender, sent }
}

const deps = (sender: EmailSender | null) => ({ secret: SECRET, sender, siteUrl: "https://majnu.app", now: NOW })

describe("handleSendEmailHook", () => {
  it("sends the email and answers 200 {}", async () => {
    const { sender, sent } = stubSender()
    const res = await handleSendEmailHook(await request(JSON.stringify(PAYLOAD)), deps(sender))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe("anna@example.com")
    expect(sent[0].subject).toBe("Your sign-in link for Majnu")
    expect(sent[0].text).toContain("https://majnu.app/auth/confirm?token_hash=pkce_abc123abc123abc123&type=magiclink")
  })

  it("answers 401 and sends nothing for an unsigned, wrongly signed, stale or tampered call", async () => {
    const body = JSON.stringify(PAYLOAD)
    const other = "v1,whsec_b3RoZXItc2VjcmV0LWZvci1tYWpudS1ob29rLTAxMjM0NTY3ODk="
    const signed = await request(body)
    const tampered = new Request(signed.url, { method: "POST", headers: signed.headers, body: body.replace("anna", "mallory") })
    for (const req of [
      await request(body, { signed: false }),
      await request(body, { secret: other }),
      await request(body, { timestamp: NOW - 3600 }),
      tampered,
    ]) {
      const { sender } = stubSender()
      const res = await handleSendEmailHook(req, deps(sender))
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: { http_code: 401, message: "Invalid signature" } })
      expect(sender.send).not.toHaveBeenCalled()
    }
  })

  it("answers 401 when the server has no secret, rather than sending unchecked", async () => {
    const { sender } = stubSender()
    const res = await handleSendEmailHook(await request(JSON.stringify(PAYLOAD)), { ...deps(sender), secret: undefined })
    expect(res.status).toBe(401)
    expect(sender.send).not.toHaveBeenCalled()
  })

  it("answers 400 for a signed but unusable payload", async () => {
    const { sender } = stubSender()
    for (const body of ["not json", JSON.stringify({ user: {} }), JSON.stringify({ ...PAYLOAD, email_data: { ...PAYLOAD.email_data, email_action_type: "sms" } })]) {
      const res = await handleSendEmailHook(await request(body), deps(sender))
      expect(res.status).toBe(400)
    }
    expect(sender.send).not.toHaveBeenCalled()
  })

  it("answers 503 with retry-after when the email service fails, so Supabase retries", async () => {
    const { sender } = stubSender(true)
    const res = await handleSendEmailHook(await request(JSON.stringify(PAYLOAD)), deps(sender))
    expect(res.status).toBe(503)
    expect(res.headers.get("retry-after")).toBe("true")
    expect((await res.json()).error.http_code).toBe(503)
  })

  it("answers 500 when there is no email binding", async () => {
    const res = await handleSendEmailHook(await request(JSON.stringify(PAYLOAD)), deps(null))
    expect(res.status).toBe(500)
  })
})
