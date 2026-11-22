// What the browser is told about a purchase: the Purchases tab, the status a
// sender watches after paying, and the "Make it unique" button. Pure, with no
// server imports, so client components can use the types and the wording.
// Stripe ids, the consent text and failure reasons never leave the server.

export type PurchaseStatusView = "pending" | "paid" | "designing" | "done" | "failed" | "refunded"

export type PurchaseView = {
  id: string
  status: PurchaseStatusView
  request: string
  createdAt: string
  paidAt: string | null
  finishedAt: string | null
  // "€2.99", from what Checkout actually charged; "Free with a code" when a
  // coupon code paid for it; "Free" for one of the day's free designs.
  amount: string
  // Paid with a coupon code (docs/features/coupons.md): no price, no receipt,
  // and a failed run gives the code back instead of a refund.
  freeWithCode: boolean
  // One of the day's free designs (docs/features/free-designs.md): no price,
  // no receipt, and a failed run gives the free design back.
  freeDesign: boolean
  // Paid with a personalisation bought in advance (issue #96): no price of
  // its own (the top-up has the receipt), and a failed run gives it back.
  paidWithCredit: boolean
  receiptUrl: string | null
  // The gift page, where the design shows once it is done.
  giftUrl: string | null
  giftTitle: string | null
}

// Today's free designs for this visitor's connection (issue #85): "Free
// today: 2 of 3 left".
export type FreeDesigns = { left: number; perDay: number }

// The dialog's starting point for one letter.
export type WrapperState = {
  // "guest" is an anonymous account: it must sign up before buying.
  account: "member" | "guest"
  // Why this letter cannot have a wrapper (yet), if it cannot.
  unavailable: "not_a_letter" | "not_built" | null
  // The newest purchase for the letter, if any.
  purchase: PurchaseView | null
  // A coupon code this browser brought from a poster's short link
  // (GET /c/<code>), normalised and not yet checked: the dialog opens with it
  // filled in. Null when there is none.
  rememberedCode: string | null
  // Today's free designs for this connection. While one is left the dialog
  // offers it first, with no account step and no consent box. Null when free
  // designs are not offered (switched off, or the address is unknown).
  freeDesigns: FreeDesigns | null
  // Personalisations this member bought in advance and has left. After the
  // free designs, the dialog offers "Use 1 of your N personalisations". Null
  // for guests, or when the balance could not be read.
  credits?: number | null
}

type Source = {
  id: string
  status: PurchaseStatusView
  request: string
  createdAt: string
  paidAt: string | null
  finishedAt: string | null
  amountCents: number
  currency: string
  couponId: string | null
  // Set for one of the day's free designs (0012_free_designs.sql).
  freeDay?: string | null
  // Set for a purchase paid with a personalisation (0013_design_credits.sql).
  paidWithCredit?: boolean
  receiptUrl: string | null
  letter: { slug: string; title: string | null } | null
}

export function formatAmount(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IE", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

export const FREE_WITH_CODE = "Free with a code"
export const FREE_DESIGN = "Free"
export const USED_CREDIT = "Used 1 personalisation"

export function toPurchaseView(purchase: Source): PurchaseView {
  const freeWithCode = purchase.couponId !== null
  const freeDesign = !freeWithCode && purchase.freeDay != null
  const paidWithCredit = !freeWithCode && !freeDesign && purchase.paidWithCredit === true
  return {
    id: purchase.id,
    status: purchase.status,
    request: purchase.request,
    createdAt: purchase.createdAt,
    paidAt: purchase.paidAt,
    finishedAt: purchase.finishedAt,
    amount: freeWithCode
      ? FREE_WITH_CODE
      : freeDesign
        ? FREE_DESIGN
        : paidWithCredit
          ? USED_CREDIT
          : formatAmount(purchase.amountCents, purchase.currency),
    freeWithCode,
    freeDesign,
    paidWithCredit,
    receiptUrl: freeWithCode || freeDesign || paidWithCredit ? null : purchase.receiptUrl,
    giftUrl: purchase.letter ? `/l/${encodeURIComponent(purchase.letter.slug)}` : null,
    giftTitle: purchase.letter?.title ?? null,
  }
}

// Still on its way: the sender keeps watching.
export function isInProgress(status: PurchaseStatusView): boolean {
  return status === "paid" || status === "designing"
}

export const STATUS_WORDS: Record<PurchaseStatusView, { label: string; detail: string }> = {
  pending: { label: "Waiting for payment", detail: "Stripe has not confirmed the payment yet." },
  paid: { label: "Paid, starting soon", detail: "Majnu starts your design in a moment." },
  designing: { label: "Being designed", detail: "Majnu is making your design. It takes about two minutes." },
  done: { label: "Ready", detail: "Your design is on the gift page." },
  failed: { label: "Something went wrong", detail: "The design could not be made. We are refunding you by hand and will email you." },
  refunded: { label: "Refunded", detail: "The design could not be made, so we refunded you in full. It reaches your card in a few days." },
}

// A purchase made with a coupon code was not paid and is never refunded, so
// two statuses read differently for it.
const CODE_WORDS: Partial<Record<PurchaseStatusView, { label: string; detail: string }>> = {
  paid: { label: "Code accepted, starting soon", detail: "Majnu starts your design in a moment." },
  failed: { label: "Something went wrong", detail: "The design could not be made. Your code works again, so you can try once more." },
}

// One of the day's free designs: nothing was paid either, and a failed run
// gives the free design back.
const FREE_WORDS: Partial<Record<PurchaseStatusView, { label: string; detail: string }>> = {
  paid: { label: "Free design, starting soon", detail: "Majnu starts your design in a moment." },
  failed: {
    label: "Something went wrong",
    detail: "The design could not be made, so it didn't count as one of your free designs. You can try again.",
  },
}

// A personalisation bought in advance: its payment was the top-up, and a
// failed run gives the personalisation back rather than refunding.
const CREDIT_WORDS: Partial<Record<PurchaseStatusView, { label: string; detail: string }>> = {
  paid: { label: "Personalisation used, starting soon", detail: "Majnu starts your design in a moment." },
  failed: {
    label: "Something went wrong",
    detail: "The design could not be made, so your personalisation is back on your balance. You can try again.",
  },
}

export function statusWords(
  purchase: Pick<PurchaseView, "status" | "freeWithCode"> & Partial<Pick<PurchaseView, "freeDesign" | "paidWithCredit">>,
): { label: string; detail: string } {
  const special = purchase.freeWithCode ? CODE_WORDS : purchase.freeDesign ? FREE_WORDS : purchase.paidWithCredit ? CREDIT_WORDS : undefined
  return special?.[purchase.status] ?? STATUS_WORDS[purchase.status]
}

// ---------- Personalisations bought in advance (issue #96) ----------

// One top-up on the Purchases tab: "3 personalisations, €8.97, Receipt".
export type TopUpView = {
  id: string
  quantity: number
  refundedQuantity: number
  amount: string
  receiptUrl: string | null
  createdAt: string
}

export function toTopUpView(grant: {
  id: string
  quantity: number
  refundedQuantity: number
  amountCents: number
  currency: string
  receiptUrl: string | null
  createdAt: string
}): TopUpView {
  return {
    id: grant.id,
    quantity: grant.quantity,
    refundedQuantity: grant.refundedQuantity,
    amount: formatAmount(grant.amountCents, grant.currency),
    receiptUrl: grant.receiptUrl,
    createdAt: grant.createdAt,
  }
}

export function personalisations(n: number): string {
  return `${n} personalisation${n === 1 ? "" : "s"}`
}
