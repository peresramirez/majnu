// Which templates the finder's wrap step offers for one gift (issue #59).
//
// Every gift can be wrapped in the gift reveal, the 3D gift box, the classic
// envelope or the postcard. The party pop box bursts into confetti and
// balloons, so it is offered only when the visitor told Majnu the gift is for
// a birthday or a party: the occasion the finder agent heard, kept in
// FinderContext.occasion.
//
// Client-safe (no server-only import): the wrap view uses it in the browser.
// POST /api/finder/wrap still accepts all five ids (WRAP_TEMPLATE_IDS in
// lib/finder/wrap.ts), so a page opened before this change keeps working.
import type { FinderContext, WrapTemplateId } from "./events"

// What POST /api/finder/wrap accepts, and what a wrap-step message to POST
// /api/finder may name (issue #70). Re-exported by lib/finder/wrap.ts; here so
// the finder route can check it without loading the builder.
export const WRAP_TEMPLATE_IDS = ["gift-reveal", "gift-box-3d", "party-box", "classic-envelope", "postcard"] as const satisfies readonly WrapTemplateId[]

// The order they are offered in: the gift templates first, then the letters
// that carry one. The first is chosen when the wrap step opens.
export const WRAP_ORDER: readonly WrapTemplateId[] = ["gift-reveal", "gift-box-3d", "party-box", "classic-envelope", "postcard"]

// The model writes the occasion as the visitor said it, usually in their own
// language ("Geburtstag", "cumpleaños", "her 30th birthday party"). These are
// the words for a birthday or a party in the languages Majnu's visitors write
// in most, without accents and in lower case.
//
// Found anywhere in the occasion, so compounds count ("Kindergeburtstag",
// "Überraschungsparty", "Geburtstagsfeier").
const PARTS = [
  // English
  "birthday",
  "party",
  "celebrat",
  // German
  "geburtstag",
  "feier",
  // French
  "anniversaire",
  // Spanish, Italian, Portuguese
  "cumplean",
  "compleanno",
  "aniversario",
  "celebrac",
  "celebraz",
  // Dutch
  "verjaardag",
  // Polish
  "urodzin",
  "impreza",
  "przyjecie",
  // Turkish
  "dogum gunu",
  // Swedish, Danish, Norwegian (ø has no accent to remove)
  "fodelsedag",
  "fødselsdag",
  "bursdag",
  // Russian
  "рожден",
  "вечеринк",
  // Arabic
  "عيد ميلاد",
  "حفل",
] as const

// Only as whole words: they are short, part of other words, or name a holiday
// in the plural or in a compound ("felices fiestas", "kerstfeest", "feestdag").
const WORDS = new Set(["bday", "b-day", "cumple", "fiesta", "festa", "fete", "fest", "feest", "feestje", "parti", "soiree"])

// Taken out before matching: they contain a party word but are a holiday, the
// end of a working day, a memorial or a parent's day.
const NOT_A_PARTY = [
  "feiertag",
  "feierabend",
  "trauerfeier",
  "gedenkfeier",
  "celebration of life",
  "fete des", // fête des mères, des pères
  "festa del", // festa della mamma, del papà
  "festa dei",
  "festa degli",
]

function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

// True for a birthday or a party in any of the languages above.
export function isPartyOccasion(occasion: string | null | undefined): boolean {
  if (!occasion) return false
  let text = normalise(occasion)
  for (const word of NOT_A_PARTY) text = text.split(word).join(" ")
  if (PARTS.some((part) => text.includes(part))) return true
  return text.split(/[^\p{L}\p{N}-]+/u).some((word) => WORDS.has(word))
}

// The templates to offer for a gift, in WRAP_ORDER.
export function wrapTemplatesFor(context: Pick<FinderContext, "occasion"> | null | undefined): WrapTemplateId[] {
  const party = isPartyOccasion(context?.occasion)
  return WRAP_ORDER.filter((id) => id !== "party-box" || party)
}
