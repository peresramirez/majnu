// Template metadata only. No component imports, so the agent code can read this
// and a broken template cannot take down the chat route.
import type { LetterKind, TemplateId } from "./schema"

export type TemplateMeta = {
  id: TemplateId
  kind: LetterKind
  name: string
  description: string
  bestFor: string[]
  // Which plan can publish it (see lib/plans.ts).
  plan: "free" | "full-moon"
}

export const templates: TemplateMeta[] = [
  {
    id: "classic-envelope",
    kind: "letter",
    name: "Classic envelope",
    description: "A sealed envelope that opens into a handwritten-style letter.",
    bestFor: ["birthdays", "love letters", "thank-yous", "just because"],
    plan: "free",
  },
  {
    id: "gift-reveal",
    kind: "letter",
    name: "Gift reveal",
    description: "A wrapped box they tap to unwrap, revealing a gift card or code and your note.",
    bestFor: ["gift cards", "vouchers", "experiences", "surprise presents"],
    plan: "free",
  },
  {
    id: "wedding-invite",
    kind: "letter",
    name: "Wedding invitation",
    description: "An elegant invitation with date, time, place and a map.",
    bestFor: ["weddings", "engagements", "anniversaries", "formal dinners"],
    plan: "free",
  },
  {
    id: "party-invite",
    kind: "letter",
    name: "Party invitation",
    description: "A playful invitation with date, place, a map and a countdown.",
    bestFor: ["birthday parties", "house parties", "dinners", "get-togethers"],
    plan: "free",
  },
  {
    id: "postcard",
    kind: "letter",
    name: "Postcard",
    description: "A short note on a postcard that flips over.",
    bestFor: ["short messages", "travel", "thinking of you", "congratulations"],
    plan: "free",
  },
  {
    id: "advent-classic",
    kind: "calendar",
    name: "Advent calendar",
    description: "24 doors, one opening each day from 1 December, each with a note or a small gift.",
    bestFor: ["Christmas", "December", "partners", "family"],
    plan: "full-moon",
  },
  {
    id: "countdown",
    kind: "calendar",
    name: "Countdown",
    description: "One door a day for any number of days up to a big date.",
    bestFor: ["birthdays", "trips", "weddings", "reunions", "anniversaries"],
    plan: "full-moon",
  },
]

export function getTemplate(id: string): TemplateMeta | undefined {
  return templates.find((t) => t.id === id)
}
