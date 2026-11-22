// A scripted stand-in for POST /api/finder and /api/finder/wrap, so every state
// of the finder can be seen without the API, a session or a model call. The
// message decides the scenario; see SCENARIOS in workbench.tsx.
import type { FinderEvent, GiftOption, WrapTemplateId } from "@/lib/finder/events"
import type { FinderTransport } from "@/components/finder/transport"

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => {
      clearTimeout(t)
      reject(new DOMException("Aborted", "AbortError"))
    })
  })

const FIRST: GiftOption[] = [
  {
    id: "opt-1",
    title: "Linen apron with her initials",
    description: "A heavy natural-linen apron, embroidered by hand.",
    reason: "She bakes every Sunday, and a monogram makes it hers rather than one more kitchen thing.",
    price: "39,90 €",
    url: "https://example.com/shop/linen-apron",
    imageUrl: "https://picsum.photos/seed/majnu-apron/640/480",
    shop: "Manufactum",
  },
  {
    id: "opt-2",
    title: "Weekend pottery class for two",
    description: "Three hours at a studio, with tea and the pieces fired and posted afterwards.",
    reason: "Something to do together, which matters more to most mothers than another object.",
    price: "89,00 €",
    url: "https://example.com/shop/pottery-class",
    imageUrl: "https://picsum.photos/seed/majnu-pottery/640/480",
    shop: "Jochen Schweizer",
  },
  {
    id: "opt-3",
    title: "Illustrated family recipe book",
    description: "A blank, cloth-bound book for the recipes she makes from memory.",
    reason: "She can fill it in for you, and it becomes a gift back to the family.",
    price: "24,95 €",
    url: "https://example.com/shop/recipe-book",
    // A broken image: the card shows its placeholder instead.
    imageUrl: "https://example.invalid/missing-image.jpg",
    shop: "Thalia",
  },
]

const SECOND: GiftOption[] = [
  {
    id: "opt-4",
    title: "Rose cuttings from a heritage nursery",
    description: "Three bare-root roses with a planting guide, delivered in season.",
    reason: "She loves her garden and still talks about the roses at her mother's house.",
    price: "54,00 €",
    url: "https://example.com/shop/heritage-roses",
    imageUrl: "https://picsum.photos/seed/majnu-roses/640/480",
    shop: "Rosen Tantau",
  },
  {
    id: "opt-5",
    title: "Gardener's kneeler and seat",
    description: "A foldable bench that turns over into a padded kneeler.",
    reason: "At 62, kneeling in the beds gets harder; this keeps her in the garden for longer.",
    price: "45,99 €",
    url: "https://example.com/shop/kneeler",
    imageUrl: "https://picsum.photos/seed/majnu-garden/640/480",
    shop: "Gartenzauber",
  },
  {
    id: "opt-6",
    title: "Pressed-flower frame kit",
    description: "An oak frame and a flower press for the best blooms of the year.",
    // No image at all: the placeholder again.
    reason: "A way to keep this summer's roses on the wall through the winter.",
    price: "29,00 €",
    url: "https://example.com/shop/flower-press",
    shop: "Idee. Creativmarkt",
  },
]

function words(text: string): FinderEvent[] {
  return text.split(/(?<= )/).map((delta) => ({ type: "text", delta }))
}

type Step = FinderEvent | number // a number is a pause in milliseconds

function scenario(message: string, turn: number): Step[] {
  const m = message.toLowerCase()
  const session: Step[] = turn === 0 ? [{ type: "session", sessionId: "dev-session" }] : []

  if (m.includes("limit")) {
    return [...session, 400, { type: "limit", reason: "finder_daily", message: "That was your third search today. Come back tomorrow for more, or sign up to keep the gifts you found." }, { type: "done" }]
  }
  if (m.includes("busy")) {
    return [...session, 400, { type: "limit", reason: "site_busy", message: "Majnu is very busy tonight. Try again in a little while." }, { type: "done" }]
  }
  if (m.includes("calendar")) {
    return [...session, 400, { type: "limit", reason: "signin_required", message: "Advent calendars need an account. Sign up, and Majnu will help you fill all 24 doors." }, { type: "done" }]
  }
  if (m.includes("error")) {
    return [...session, { type: "status", label: "Looking at gifts in Germany…" }, 900, { type: "error", message: "Something went wrong finding gifts. Try again." }, { type: "done" }]
  }
  if (m.includes("cut")) {
    // The stream ends without `done`.
    return [...session, { type: "status", label: "Looking at gifts in Germany…" }, 700, ...words("Let me look at a few shops ")]
  }
  if (m.includes("personalise the gift")) {
    return [
      ...session,
      600,
      ...words("Of course. A few questions, and I'll look again. "),
      300,
      { type: "question", text: "What does she love doing when she has a free afternoon?", suggestions: ["Gardening", "Reading", "Cooking for everyone", "Long walks"] },
      { type: "done" },
    ]
  }
  if (turn > 0) {
    return [
      ...session,
      { type: "context", context: { country: "DE", region: "Berlin", language: "de", currency: "EUR", relationship: "mother", ageRange: [55, 70], interests: [m.slice(0, 24) || "gardening"] } },
      { type: "status", label: "Looking for gifts for a gardener…" },
      900,
      { type: "status", label: "Comparing prices in three shops…" },
      900,
      ...words("These three are made for someone who lives in her garden. "),
      { type: "options", options: SECOND, recommendedId: "opt-4", why: "It ties the gift to a memory she already treasures, and it comes back every June." },
      { type: "done" },
    ]
  }
  // A birthday is heard as the occasion, so the wrap step offers the party pop box.
  const occasion = m.includes("birthday") ? { occasion: "birthday" } : {}
  return [
    ...session,
    { type: "context", context: { country: "DE", region: "Berlin", language: "de", currency: "EUR", relationship: "mother", ageRange: [45, 70], ...occasion } },
    { type: "status", label: "Looking at gifts in Germany…" },
    1000,
    { type: "status", label: "Reading three shops…" },
    900,
    ...words("Here are three ideas for your mother, from shops that deliver in Germany. I guessed she is between 45 and 70; tap the chips above if that's wrong. "),
    300,
    { type: "options", options: FIRST, recommendedId: "opt-2", why: "Time together is the gift most mothers say they want, and the pieces you make become a keepsake." },
    { type: "done" },
  ]
}

export function createMockTransport(): FinderTransport {
  let turn = 0
  return {
    async ensureSession() {
      await new Promise((r) => setTimeout(r, 300))
    },
    async *stream(request, signal) {
      const steps = scenario(request.message, request.sessionId ? turn : 0)
      turn = request.sessionId ? turn + 1 : 1
      for (const step of steps) {
        if (typeof step === "number") await sleep(step, signal)
        else {
          if (step.type === "text") await sleep(45, signal)
          yield step
        }
      }
    },
    async wrap(request) {
      await new Promise((r) => setTimeout(r, 1400))
      if (request.note?.toLowerCase().includes("fail")) return { error: "Something went wrong wrapping the gift. Try again." }
      return { letterId: `dev-${request.templateId}`, slug: "demo-gift" }
    },
    // The dev workbench renders each template from its fixture.
    previewUrl: (_letterId: string, templateId: WrapTemplateId) => `/dev/templates/${templateId}`,
    shareUrl: (slug) => `${window.location.origin}/l/${slug}`,
  }
}
