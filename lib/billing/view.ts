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
  // "€2.99", from what Checkout actually charged.
  amount: string
  receiptUrl: string | null
  // The gift page, where the design shows once it is done.
  giftUrl: string | null
  giftTitle: string | null
}

// The dialog's starting point for one letter.
export type WrapperState = {
  // "guest" is an anonymous account: it must sign up before buying.
  account: "member" | "guest"
  // Why this letter cannot have a wrapper (yet), if it cannot.
  unavailable: "not_a_letter" | "not_built" | null
  // The newest purchase for the letter, if any.
  purchase: PurchaseView | null
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

export function toPurchaseView(purchase: Source): PurchaseView {
  return {
    id: purchase.id,
    status: purchase.status,
    request: purchase.request,
    createdAt: purchase.createdAt,
    paidAt: purchase.paidAt,
    finishedAt: purchase.finishedAt,
    amount: formatAmount(purchase.amountCents, purchase.currency),
    receiptUrl: purchase.receiptUrl,
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
