// What Majnu costs (docs/business-plan.md, decided 21 November): everything is
// free except one thing, a personalised wrapper for one gift, paid once.
// The landing page, the Purchases tab, the checkout and the terms read the
// wording and the price from here. No secrets and no server imports, so client
// components can import it too.

export const free = {
  id: "free",
  name: "Free",
  price: "€0",
  summary: "Find a gift, wrap it in one of our designs, share it and see when it is opened.",
  features: [
    "Find a gift: three ideas from shops in your country",
    "Personalise the search with a few questions",
    "Wrap it in one of our designs",
    "Letters and invitations, with gift lists",
    "Share it by link, WhatsApp or QR code",
    "See when it is opened",
    "Advent calendars, with a free account",
  ],
  cta: "Find a gift",
} as const

// One design made by Majnu's designer for one gift: Claude Code in a Daytona
// sandbox (lib/daytona/redesign.ts), started when Stripe confirms the payment.
// The price includes VAT. Stripe's Price object (STRIPE_PRICE_WRAPPER) must
// carry the same amount and currency; tests/smoke/stripe-wrapper-price.test.ts
// checks that it does.
export const wrapper = {
  id: "personalised-wrapper",
  name: "Personalised wrapper",
  priceCents: 299,
  currency: "eur",
  price: "€2.99",
  period: "once, for one gift",
  summary: "Instead of one of our designs, Majnu makes a page for this gift alone.",
  features: [
    "A design Majnu makes for this one gift",
    "Made around the person and what you want to say",
    "Paid once, for one gift. Nothing to cancel",
  ],
  cta: "Make it unique, €2.99",
  // Shown in Checkout and on receipts.
  productName: "Majnu personalised wrapper",
} as const

// The sender's design request, as the dialog takes it. The job accepts up to
// MAX_REQUEST_CHARS (lib/daytona/config.ts); the dialog asks for less.
export const WRAPPER_REQUEST_MAX_CHARS = 500

// The sentence the sender agrees to by ticking the box before Checkout. A
// wrapper is digital content made to order and delivered at once: the right of
// withdrawal ends when delivery starts only if the buyer expressly agrees to
// immediate delivery and confirms they lose the right (§ 356 (5) BGB). The
// server stores this exact text with the purchase, never text the browser sent.
export const WRAPPER_CONSENT_TEXT =
  "Start making my design straight away. I understand that because it is made just for me, I lose my right of withdrawal once it is made."
