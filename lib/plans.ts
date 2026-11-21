// The two plans shown on the landing page. Billing code reads limits and prices from here.
export const plans = {
  free: {
    id: "free",
    name: "Crescent",
    price: "Free",
    period: "",
    summary: "For a gift now and then.",
    giftsPerMonth: 3,
    features: [
      "3 gifts a month",
      "Letters, invitations and gift pages",
      "Majnu helps you with the words",
      "Share by link, QR code or WhatsApp",
      "See when your gift is opened",
    ],
    cta: "Create a gift",
  },
  fullMoon: {
    id: "full-moon",
    name: "Full moon",
    price: "€4.99",
    priceCents: 499,
    currency: "eur",
    period: "a month",
    summary: "For people who give often.",
    giftsPerMonth: null,
    features: [
      "Unlimited gifts",
      "Advent calendars, one door a day",
      "Gift research: Majnu searches the web for ideas and current deals",
      "Everything in Crescent",
      "Cancel anytime",
    ],
    cta: "Choose Full moon",
  },
} as const
