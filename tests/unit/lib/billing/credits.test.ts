// Personalisations bought in advance (issue #96), with Stripe, the database
// functions, the purchases table and the queue replaced by the fakes in
// ./fakes.ts: Checkout only for a checked quantity and the signed-in member,
// credits granted once per paid session (webhook, retries and the return
// page), the quantity taken from Stripe's line item, and a credit used
// without Stripe and given back when its design fails.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/billing/stripe", async () => (await import("./fakes")).stripeModule)
vi.mock("@/lib/billing/purchases", async () => (await import("./fakes")).purchasesModule)
vi.mock("@/lib/billing/my-purchases", async () => (await import("./fakes")).myPurchasesModule)
vi.mock("@/lib/billing/queue", () => ({ enqueueDesign: vi.fn(async () => "queued") }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }))
vi.mock("@/lib/supabase/admin", async () => {
  const { creditRpc } = await import("./fakes")
  return {
    createAdminClient: () => ({
      rpc: (name: string, args: Record<string, unknown>) => {
        const result = Promise.resolve(creditRpc(name, args))
        return Object.assign(result, { single: () => result })
      },
    }),
  }
})
vi.mock("@/lib/daytona/redesign", () => ({
  redesignLetter: vi.fn(async () => {
    throw new Error("the real redesign must not run in tests")
  }),
}))

import type Stripe from "stripe"
import {
  applyPaidCreditsSession,
  claimDesignCredit,
  confirmTopUp,
  designCreditsBalance,
  paidQuantity,
  startCreditsCheckout,
} from "@/lib/billing/credits"
import { runPurchaseDesign } from "@/lib/billing/fulfil"
import { enqueueDesign } from "@/lib/billing/queue"
import { handleStripeEvent } from "@/lib/billing/service"
import { toPurchaseView, USED_CREDIT } from "@/lib/billing/view"
import { CREDIT_CONSENT_TEXT } from "@/lib/plans"
import { addLetter, creditBalance, db, purchasesModule, resetDb, resetStripe, stripe } from "./fakes"

const SITE = "https://majnu.app"
const OWNER = "5f0c1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b"
const MEMBER = { id: OWNER, email: "anna@example.com", isAnonymous: false }
const LETTER = "0b6f2a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5c"
const LETTER2 = "0b6f2a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5d"
const SESSION = "cs_test_a1B2c3D4e5F6g7H8i9J0"

// A paid top-up session as Stripe returns it with line_items and the charge expanded.
function topUpSession(quantity: number, overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION,
    object: "checkout.session",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    client_reference_id: OWNER,
    amount_total: 299 * quantity,
    currency: "eur",
    metadata: { kind: "credits", owner: OWNER, quantity: String(quantity) },
    line_items: { object: "list", data: [{ id: "li_1", quantity, price: { id: "price_test_wrapper" } }] },
    payment_intent: { id: "pi_test_topup", object: "payment_intent", latest_charge: { id: "ch_1", receipt_url: "https://pay.stripe.com/receipts/t1" } },
    ...overrides,
  } as unknown as Stripe.Checkout.Session
}

function event(type: string, object: unknown): Stripe.Event {
  return { id: `evt_${type}`, object: "event", type, data: { object } } as unknown as Stripe.Event
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv("STRIPE_PRICE_WRAPPER", "price_test_wrapper")
  vi.stubEnv("ANTHROPIC_API_KEY_FALLBACK", "")
  vi.stubEnv("DAYTONA_API_KEY_FALLBACK", "")
  vi.mocked(enqueueDesign).mockReset()
  vi.mocked(enqueueDesign).mockImplementation(async () => "queued")
  Object.values(purchasesModule).forEach((fn) => fn.mockClear())
  resetDb()
  resetStripe()
  db.currentUser = OWNER
  addLetter(LETTER, { ownerId: OWNER })
  addLetter(LETTER2, { ownerId: OWNER })
  stripe.checkout.sessions.create.mockImplementation(async () => ({ id: SESSION, url: `https://checkout.stripe.com/c/pay/${SESSION}` }))
})

describe("startCreditsCheckout", () => {
  it("opens Checkout in payment mode for quantity x the wrapper price, with metadata written on the server", async () => {
    const result = await startCreditsCheckout(MEMBER, { quantity: 3 }, SITE)
    expect(result).toEqual({ kind: "redirect", url: `https://checkout.stripe.com/c/pay/${SESSION}` })
    const params = stripe.checkout.sessions.create.mock.calls[0][0]
    expect(params).toMatchObject({
      mode: "payment",
      line_items: [{ price: "price_test_wrapper", quantity: 3 }],
      client_reference_id: OWNER,
      customer_email: "anna@example.com",
      metadata: { kind: "credits", owner: OWNER, quantity: "3" },
      payment_intent_data: { metadata: { kind: "credits", owner: OWNER, quantity: "3" } },
      success_url: `${SITE}/dashboard/purchases?topup={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/dashboard/purchases`,
      managed_payments: { enabled: false },
      integration_identifier: "majnu_credits_test",
    })
    expect(params).not.toHaveProperty("payment_method_types")
    // Nothing is recorded before Stripe says it is paid.
    expect(db.creditGrants.size).toBe(0)
  })

  it.each([0, 6, -1, 2.5, "3", null, undefined])("refuses the quantity %s without calling Stripe", async (quantity) => {
    const result = await startCreditsCheckout(MEMBER, { quantity }, SITE)
    expect(result).toMatchObject({ kind: "refused", reason: "invalid_quantity" })
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it("refuses a guest account", async () => {
    const result = await startCreditsCheckout({ ...MEMBER, isAnonymous: true }, { quantity: 1 }, SITE)
    expect(result).toMatchObject({ kind: "refused", reason: "account_required" })
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })
})

describe("granting a paid top-up", () => {
  it("grants the line item's quantity once, however often it is applied", async () => {
    expect(await applyPaidCreditsSession(topUpSession(3))).toEqual({ outcome: "granted", quantity: 3, balance: 3 })
    expect(await applyPaidCreditsSession(topUpSession(3))).toEqual({ outcome: "already_granted", quantity: 3, balance: 3 })
    expect(db.creditGrants.size).toBe(1)
    expect(db.creditGrants.get(SESSION)).toMatchObject({ ownerId: OWNER, quantity: 3, amountCents: 897, paymentIntentId: "pi_test_topup", receiptUrl: "https://pay.stripe.com/receipts/t1" })
    expect(await designCreditsBalance(OWNER)).toBe(3)
  })

  it("grants nothing when the metadata, the line item or the amount disagree", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const tampered = [
      topUpSession(3, { metadata: { kind: "credits", owner: OWNER, quantity: "5" } }),
      topUpSession(3, { line_items: { data: [{ quantity: 3, price: { id: "price_other" } }] } }),
      topUpSession(3, { line_items: { data: [] } }),
      topUpSession(3, { currency: "usd" }),
      topUpSession(9, { metadata: { kind: "credits", owner: OWNER, quantity: "9" } }),
      topUpSession(3, { client_reference_id: "someone-else" }),
      topUpSession(3, { payment_status: "unpaid" }),
    ]
    for (const session of tampered) expect((await applyPaidCreditsSession(session)).outcome).toBe("ignored")
    expect(db.creditGrants.size).toBe(0)
  })

  it("reads the quantity from the line item, not from the metadata alone", () => {
    expect(paidQuantity(topUpSession(2), "price_test_wrapper")).toBe(2)
    expect(paidQuantity(topUpSession(2, { line_items: { data: [{ quantity: 4, price: "price_test_wrapper" }] } }), "price_test_wrapper")).toBeNull()
  })

  it("the webhook grants on checkout.session.completed and a replayed event changes nothing", async () => {
    stripe.checkout.sessions.retrieve.mockImplementation(async () => topUpSession(2))
    const snapshot = { ...topUpSession(2), line_items: undefined }
    expect(await handleStripeEvent(event("checkout.session.completed", snapshot))).toEqual({ outcome: "granted", quantity: 2 })
    expect(await handleStripeEvent(event("checkout.session.completed", snapshot))).toEqual({ outcome: "already_granted", quantity: 2 })
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith(SESSION, { expand: ["line_items", "payment_intent.latest_charge"] })
    expect(creditBalance(OWNER)).toBe(2)
  })

  it("the webhook waits for a delayed payment, then grants on async_payment_succeeded", async () => {
    const unpaid = topUpSession(1, { payment_status: "unpaid" })
    expect((await handleStripeEvent(event("checkout.session.completed", unpaid))).outcome).toBe("ignored")
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled()
    stripe.checkout.sessions.retrieve.mockImplementation(async () => topUpSession(1))
    expect(await handleStripeEvent(event("checkout.session.async_payment_succeeded", topUpSession(1)))).toEqual({ outcome: "granted", quantity: 1 })
  })

  it("an expired top-up is ignored and never touches purchases", async () => {
    expect((await handleStripeEvent(event("checkout.session.expired", topUpSession(1, { status: "expired" })))).outcome).toBe("ignored")
    expect(purchasesModule.deletePendingPurchase).not.toHaveBeenCalled()
  })

  it("the return page confirms the session for its own member only", async () => {
    stripe.checkout.sessions.retrieve.mockImplementation(async () => topUpSession(2))
    expect(await confirmTopUp({ id: "another-user" }, SESSION)).toEqual({ outcome: "not_found" })
    expect(db.creditGrants.size).toBe(0)
    expect(await confirmTopUp({ id: OWNER }, "not-a-session")).toEqual({ outcome: "not_found" })
    expect(await confirmTopUp({ id: OWNER }, SESSION)).toEqual({ outcome: "granted", quantity: 2 })
    // And again (a reload, or the webhook first): still two.
    expect(await confirmTopUp({ id: OWNER }, SESSION)).toEqual({ outcome: "granted", quantity: 2 })
    expect(creditBalance(OWNER)).toBe(2)
  })

  it("the return page says processing for a session that is complete but not paid yet", async () => {
    stripe.checkout.sessions.retrieve.mockImplementation(async () => topUpSession(1, { payment_status: "unpaid" }))
    expect(await confirmTopUp({ id: OWNER }, SESSION)).toEqual({ outcome: "processing" })
    expect(db.creditGrants.size).toBe(0)
  })
})

describe("using a personalisation", () => {
  const input = { letterId: LETTER, request: "A night sky with our two stars", consent: true }

  async function buy(quantity: number) {
    await applyPaidCreditsSession(topUpSession(quantity))
  }

  it("needs the consent box before anything else", async () => {
    await buy(1)
    expect(await claimDesignCredit({ id: OWNER }, { ...input, consent: undefined })).toMatchObject({ kind: "refused", reason: "consent_required" })
    expect(creditBalance(OWNER)).toBe(1)
  })

  it("uses one, records the purchase with the server's consent text and starts the design, without Stripe", async () => {
    await buy(2)
    const result = await claimDesignCredit({ id: OWNER }, input)
    if (result.kind !== "claimed") throw new Error(`expected claimed, got ${result.reason}`)
    expect(result.balance).toBe(1)
    const stored = db.purchases.get(result.purchase.id)!
    expect(stored).toMatchObject({ status: "paid", amountCents: 0, paidWithCredit: true, consentText: CREDIT_CONSENT_TEXT, checkoutSessionId: null })
    expect(enqueueDesign).toHaveBeenCalledWith(result.purchase.id)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
    expect(creditBalance(OWNER)).toBe(1)
  })

  it("refuses with none left, and a second design for a letter already on its way", async () => {
    await buy(1)
    expect((await claimDesignCredit({ id: OWNER }, input)).kind).toBe("claimed")
    expect(await claimDesignCredit({ id: OWNER }, input)).toMatchObject({ kind: "refused", reason: "in_progress" })
    expect(await claimDesignCredit({ id: OWNER }, { ...input, letterId: LETTER2 })).toMatchObject({ kind: "refused", reason: "none_left", balance: 0 })
  })

  it("refuses someone else's letter", async () => {
    await buy(1)
    db.currentUser = "another-user"
    expect(await claimDesignCredit({ id: "another-user" }, input)).toMatchObject({ kind: "refused", reason: "letter_not_found" })
    expect(creditBalance(OWNER)).toBe(1)
  })

  it("gives it back when the design cannot be started", async () => {
    await buy(1)
    vi.mocked(enqueueDesign).mockRejectedValueOnce(new Error("queue down"))
    await expect(claimDesignCredit({ id: OWNER }, input)).rejects.toThrow("queue down")
    expect(creditBalance(OWNER)).toBe(1)
    expect([...db.purchases.values()][0].status).toBe("failed")
  })

  it("a failed design gives the personalisation back and never calls Stripe", async () => {
    await buy(1)
    const result = await claimDesignCredit({ id: OWNER }, input)
    if (result.kind !== "claimed") throw new Error("expected claimed")
    expect(creditBalance(OWNER)).toBe(0)
    const outcome = await runPurchaseDesign(result.purchase.id, {
      redesign: async () => {
        throw new Error("the sandbox stopped")
      },
      log: () => undefined,
    })
    expect(outcome.outcome).toBe("credit_returned")
    expect(stripe.refunds.create).not.toHaveBeenCalled()
    expect(db.purchases.get(result.purchase.id)!.status).toBe("failed")
    expect(creditBalance(OWNER)).toBe(1)
  })

  it("shows on the Purchases tab as 'Used 1 personalisation', with no receipt of its own", async () => {
    await buy(1)
    const result = await claimDesignCredit({ id: OWNER }, input)
    if (result.kind !== "claimed") throw new Error("expected claimed")
    const view = toPurchaseView({ ...result.purchase, receiptUrl: "https://pay.stripe.com/receipts/x", letter: null })
    expect(view).toMatchObject({ amount: USED_CREDIT, paidWithCredit: true, freeWithCode: false, freeDesign: false, receiptUrl: null })
  })
})
