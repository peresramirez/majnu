// Supabase Auth's Send Email hook: Supabase calls POST /api/auth/send-email for
// every account email (sign-up confirmation, sign-in link, password reset,
// invitation, email change, reauthentication code) instead of sending it
// itself. This checks the hook's signature, builds the email and sends it.
//
// Answers in the shape Supabase expects: 200 {} when sent; otherwise
// { error: { http_code, message } }. 401 for a request that is unsigned,
// stale or signed with another secret. 503 (retried by Supabase within its
// five-second budget) when the email service did not take the email.
import "server-only"
import { buildAuthEmails, UnsupportedEmailError, type HookPayload } from "./auth-emails"
import type { EmailSender } from "./sender"
import { verifyWebhook, webhookHeaders } from "./webhook"

export type HookDeps = {
  secret: string | undefined
  sender: EmailSender | null
  siteUrl: string
  now?: number
}

export async function handleSendEmailHook(request: Request, deps: HookDeps): Promise<Response> {
  const body = await request.text()
  const check = await verifyWebhook(deps.secret, webhookHeaders(request.headers), body, deps.now)
  if (!check.ok) {
    if (check.reason === "bad_secret") console.error("send-email hook: SEND_EMAIL_HOOK_SECRET is missing or malformed")
    return hookError(401, "Invalid signature")
  }

  let payload: HookPayload
  try {
    payload = JSON.parse(body) as HookPayload
    if (!payload?.user || typeof payload.email_data?.email_action_type !== "string") throw new Error("shape")
  } catch {
    return hookError(400, "Malformed payload")
  }

  let emails
  try {
    emails = buildAuthEmails(payload, { siteUrl: deps.siteUrl })
  } catch (error) {
    if (error instanceof UnsupportedEmailError) {
      console.error("send-email hook:", error.message)
      return hookError(400, "Unsupported email")
    }
    throw error
  }

  if (!deps.sender) {
    console.error("send-email hook: no EMAIL binding; email not sent", payload.email_data.email_action_type)
    return hookError(500, "Email sending is not configured")
  }

  try {
    for (const email of emails) await deps.sender.send(email)
  } catch (error) {
    // The address is not logged: it is personal data, and the type is enough to debug.
    console.error("send-email hook: send failed", payload.email_data.email_action_type, error instanceof Error ? error.message : error)
    return hookError(503, "Email service unavailable", { "retry-after": "true" })
  }

  return Response.json({}, { status: 200 })
}

function hookError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return Response.json({ error: { http_code: status, message } }, { status, headers })
}
