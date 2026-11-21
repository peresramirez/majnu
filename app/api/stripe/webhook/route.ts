// POST /api/stripe/webhook: Stripe's events about subscriptions, checkouts and
// invoices, verified against STRIPE_WEBHOOK_SECRET before anything is read.
//
// 400 without a valid signature, 413 for an oversized body, 500 when the
// secret is missing or processing fails (Stripe then retries with backoff for
// up to three days), 200 otherwise, including for events we do not act on.
// Handlers are idempotent, so retries and duplicates are harmless
// (lib/billing/service.ts).
import { constructWebhookEvent, type Stripe } from "@/lib/billing/stripe"
import { handleStripeEvent } from "@/lib/billing/service"

export const dynamic = "force-dynamic"

// Stripe's event payloads are a few kilobytes; anything far larger is not Stripe.
const MAX_BODY = 512 * 1024

const NO_STORE = { "Cache-Control": "no-store" }

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: NO_STORE })
}

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature")
  if (!signature) return json(400, { error: "Missing Stripe-Signature header" })

  const declaredLength = Number(request.headers.get("content-length") ?? 0)
  if (declaredLength > MAX_BODY) return json(413, { error: "Body too large" })

  // The signature covers the exact bytes Stripe sent, so the body is read as
  // raw text and parsed only by the SDK after verification.
  const rawBody = await request.text()
  if (rawBody.length > MAX_BODY) return json(413, { error: "Body too large" })

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("stripe webhook: STRIPE_WEBHOOK_SECRET is not set")
    return json(500, { error: "Webhook not configured" })
  }

  let event: Stripe.Event
  try {
    event = await constructWebhookEvent(rawBody, signature)
  } catch {
    return json(400, { error: "Invalid signature" })
  }

  try {
    const result = await handleStripeEvent(event)
    return json(200, { received: true, outcome: result.outcome })
  } catch (error) {
    console.error("stripe webhook failed", event.type, event.id, error instanceof Error ? error.message : error)
    return json(500, { error: "Processing failed" })
  }
}
