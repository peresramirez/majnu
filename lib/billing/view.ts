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

export function toPurchaseView(purchase: Source): PurchaseView {
  const freeWithCode = purchase.couponId !== null
  const freeDesign = !freeWithCode && purchase.freeDay != null
  return {
    id: purchase.id,
    status: purchase.status,
    request: purchase.request,
    createdAt: purchase.createdAt,
    paidAt: purchase.paidAt,
    finishedAt: purchase.finishedAt,
    amount: freeWithCode ? FREE_WITH_CODE : freeDesign ? FREE_DESIGN : formatAmount(purchase.amountCents, purchase.currency),
    freeWithCode,
    freeDesign,
    receiptUrl: freeWithCode || freeDesign ? null : purchase.receiptUrl,
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

export function statusWords(
  purchase: Pick<PurchaseView, "status" | "freeWithCode"> & Partial<Pick<PurchaseView, "freeDesign">>,
): { label: string; detail: string } {
  const special = purchase.freeWithCode ? CODE_WORDS : purchase.freeDesign ? FREE_WORDS : undefined
  return special?.[purchase.status] ?? STATUS_WORDS[purchase.status]
}
