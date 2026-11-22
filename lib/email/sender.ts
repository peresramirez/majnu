// Sends an email through Cloudflare Email Service with the Worker's
// `send_email` binding (wrangler.jsonc: "send_email": [{ "name": "EMAIL" }]).
// The binding exists only on the deployed Worker. In `next dev` the email is
// written to the server log instead (the developer's own terminal), and tests
// pass their own sender.
import "server-only"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import type { OutgoingEmail } from "./auth-emails"
import { EMAIL_FROM } from "./auth-emails"

export const EMAIL_BINDING = "EMAIL"

export type EmailSender = { send(email: OutgoingEmail): Promise<void> }

// The part of the binding's interface this app uses (workerd's SendEmail).
type SendEmailBinding = {
  send(message: {
    to: string
    from: { email: string; name: string }
    subject: string
    html: string
    text: string
  }): Promise<{ messageId?: string }>
}

function emailBinding(): SendEmailBinding | null {
  try {
    const env = getCloudflareContext().env as Record<string, unknown>
    const binding = env[EMAIL_BINDING]
    return binding && typeof (binding as SendEmailBinding).send === "function" ? (binding as SendEmailBinding) : null
  } catch {
    // Not running on Workers (next dev, tests, scripts).
    return null
  }
}

export function getEmailSender(): EmailSender | null {
  const binding = emailBinding()
  if (binding) {
    return {
      async send(email) {
        await binding.send({ to: email.to, from: { ...EMAIL_FROM }, subject: email.subject, html: email.html, text: email.text })
      },
    }
  }
  if (process.env.NODE_ENV === "development") {
    return {
      async send(email) {
        console.info(`[email not sent: no EMAIL binding in next dev] to ${email.to}: ${email.subject}\n${email.text}`)
      },
    }
  }
  return null
}
