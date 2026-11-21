// Template metadata only. No component imports, so the agent code can read this
// and a broken template cannot take down the chat route.
import type { LetterKind, TemplateId } from "./schema"

// How the Templates tab groups templates. A gift template carries a gift card
// or code; an invitation carries an event. Both are still letters in `kind`.
export type TemplateCategory = "gift" | "letter" | "invitation" | "calendar"

export type TemplateMeta = {
  id: TemplateId
  kind: LetterKind
  category: TemplateCategory
  name: string
  description: string
  bestFor: string[]
  // Which plan can publish it (see lib/plans.ts).
  plan: "free" | "full-moon"
}

export const templateCategories: { id: TemplateCategory; label: string }[] = [
  { id: "gift", label: "Gifts" },
  { id: "letter", label: "Letters" },
  { id: "invitation", label: "Invitations" },
  { id: "calendar", label: "Calendars" },
]

export const templates: TemplateMeta[] = [
  {
    id: "classic-envelope",
    kind: "letter",
    category: "letter",
    name: "Classic envelope",
    description: "A sealed envelope that opens into a handwritten-style letter.",
    bestFor: ["birthdays", "love letters", "thank-yous", "just because"],
    plan: "free",
  },
  {
    id: "gift-reveal",
    kind: "letter",
    category: "gift",
    name: "Gift reveal",
    description: "A wrapped box they tap to unwrap, revealing a gift card or code and your note.",
    bestFor: ["gift cards", "vouchers", "experiences", "surprise presents"],
    plan: "free",
  },
  {
    id: "gift-box-3d",
    kind: "letter",
    category: "gift",
    name: "3D gift box",
    description:
      "A ribbon-tied box in 3D. The bow unties, the sides fold open and a card rises in sparkles, then the gift card or code and your note. Needs at least one gift.",
    bestFor: ["gift cards", "vouchers", "experiences", "big surprises"],
    plan: "free",
  },
  {
    id: "party-box",
    kind: "letter",
    category: "gift",
    name: "Party pop box",
    description:
      "A box that wobbles, then pops its lid in a burst of confetti and balloons, and shows your note, any gift and, if there is one, the party's date and place.",
    bestFor: ["birthdays", "congratulations", "celebrations", "party surprises"],
    plan: "free",
  },
  {
    id: "wedding-invite",
    kind: "letter",
    category: "invitation",
    name: "Wedding invitation",
    description: "An elegant invitation with date, time, place and a map.",
    bestFor: ["weddings", "engagements", "anniversaries", "formal dinners"],
    plan: "free",
  },
  {
    id: "party-invite",
    kind: "letter",
    category: "invitation",
    name: "Party invitation",
    description: "A playful invitation with date, place, a map and a countdown.",
    bestFor: ["birthday parties", "house parties", "dinners", "get-togethers"],
    plan: "free",
  },
  {
    id: "postcard",
    kind: "letter",
    category: "letter",
    name: "Postcard",
    description: "A short note on a postcard that flips over.",
    bestFor: ["short messages", "travel", "thinking of you", "congratulations"],
    plan: "free",
  },
  {
    id: "treasure-map",
    kind: "letter",
    category: "letter",
    name: "Treasure map",
    description:
      "A folded map sealed with wax. Breaking the seal opens it into your letter, inked on old paper, with a dotted path that ends at their name.",
    bestFor: ["adventures", "trips", "anniversaries", "a surprise plan"],
    plan: "free",
  },
  {
    id: "advent-classic",
    kind: "calendar",
    category: "calendar",
    name: "Advent calendar",
    description: "24 doors, one opening each day from 1 December, each with a note or a small gift.",
    bestFor: ["Christmas", "December", "partners", "family"],
    plan: "full-moon",
  },
  {
    id: "countdown",
    kind: "calendar",
    category: "calendar",
    name: "Countdown",
    description: "One door a day for any number of days up to a big date.",
    bestFor: ["birthdays", "trips", "weddings", "reunions", "anniversaries"],
    plan: "full-moon",
  },
]

export function getTemplate(id: string): TemplateMeta | undefined {
  return templates.find((t) => t.id === id)
}
