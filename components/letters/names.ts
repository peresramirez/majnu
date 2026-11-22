// Names and titles shown around a letter. Page titles and link previews use
// these and nothing else from the content, so they never leak the message.
import type { TemplateId } from "@/lib/letters/schema"

// "Anna Schmidt" -> "Anna". Falls back to "you" when there is no name.
// Gift pages use wholeName() instead, so "our friends" and "Mia and Leo" stay
// whole; this is for places that want one short word.
export function firstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? ""
  const clean = first.replace(/[.,;:!?]+$/, "").slice(0, 40)
  return clean || "you"
}

const MAX_NAME_CHARS = 40

// The name as the sender gave it, whole: "Anna", "Mia & Leo", "our friends".
// The builder writes a first name or a nickname, or a group for an invitation,
// so cutting it to its first word would turn "our friends" into "our" (issue
// #62). Spaces are tidied and end punctuation dropped; a very long name is cut
// at a word, with an ellipsis. `fallback` when there is no name.
export function wholeName(name: string | null | undefined, fallback = "you"): string {
  const clean = tidy(name)
  if (!clean) return fallback
  if (Array.from(clean).length <= MAX_NAME_CHARS) return clean
  const cut = Array.from(clean).slice(0, MAX_NAME_CHARS).join("")
  const space = cut.lastIndexOf(" ")
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?&+-]+$/, "")}…`
}

// Two or more people joined ("Mia & Leo", "Lea and Max", "Mama und Papa").
const JOINED = /\s+(?:and|&|\+|und|y|et|e)\s+|\s*&\s*/i
// How a group starts ("our friends", "the Schmidts", "dear neighbours").
const GROUP_START = /^(?:our|my|your|the|dear|all|both)$/i
// Words for several people, in English and German, wherever they end a name
// ("Friends", "my dear friends", "Liebe Freunde").
const PLURAL_NOUNS = new Set([
  "friends", "parents", "grandparents", "guests", "neighbours", "neighbors", "colleagues", "cousins", "siblings",
  "sisters", "brothers", "twins", "girls", "boys", "guys", "ladies", "kids", "children", "grandchildren", "people", "folks",
  "freunde", "freundinnen", "eltern", "großeltern", "kinder", "nachbarn", "kollegen", "gäste", "geschwister",
])
// Ways to address everyone at once.
const TOGETHER = new Set(["you all", "y'all", "all of you", "both of you", "you both", "you two"])

function tidy(name: string | null | undefined): string {
  return (name ?? "").replace(/\s+/g, " ").trim().replace(/[.,;:!?]+$/, "")
}

// Whether a name stands for more than one person, so the words around it
// agree ("Only Mia & Leo see it"). "Everyone" and "the family" take a
// singular verb in English, so they are not groups here.
export function isGroup(name: string | null | undefined): boolean {
  const clean = tidy(name)
  if (!clean) return false
  if (clean.split(JOINED).filter((part) => part.trim()).length >= 2) return true
  if (TOGETHER.has(clean.toLowerCase())) return true
  const words = clean.split(" ")
  const last = words[words.length - 1]
  if (PLURAL_NOUNS.has(last.toLowerCase())) return true
  if (words.length < 2 || !GROUP_START.test(words[0])) return false
  // "our nieces", "my loves", but not "my boss" or "our Lucas": a name
  // ending in s is a family only after "the" ("the Schmidts").
  const plural = /[^su]s$/i.test(last)
  const named = last[0] !== last[0].toLowerCase()
  return plural && (!named || words[0].toLowerCase() === "the")
}

// The verb form that agrees with a name: verbFor("Anna", "sees", "see") is
// "sees", verbFor("Mia & Leo", "sees", "see") and verbFor("you", ...) "see".
export function verbFor(name: string | null | undefined, singular: string, plural: string): string {
  const clean = (name ?? "").trim().toLowerCase()
  return clean === "you" || isGroup(name) ? plural : singular
}

// "Anna's", "Lea and Max's", "the Schmidts'".
export function possessive(name: string): string {
  return isGroup(name) && /s$/i.test(name) ? `${name}'` : `${name}'s`
}

// The first letter in upper case, for a name that starts a sentence ("our
// friends" -> "Our friends hear it").
export function sentenceStart(text: string): string {
  return text ? text[0].toLocaleUpperCase() + text.slice(1) : text
}

const nouns: Record<TemplateId, string> = {
  "classic-envelope": "A letter",
  "gift-reveal": "A gift",
  "wedding-invite": "An invitation",
  "party-invite": "An invitation",
  postcard: "A postcard",
  "gift-box-3d": "A gift",
  "party-box": "A gift",
  "treasure-map": "A letter",
  "wedding-envelope-3d": "An invitation",
  "advent-classic": "An advent calendar",
  countdown: "A countdown",
}

// "A letter", "An invitation", "An advent calendar". Unknown ids are letters.
export function letterNoun(templateId: string | null | undefined): string {
  return nouns[templateId as TemplateId] ?? "A letter"
}

// "A letter for Anna", "An invitation for our friends", "An advent calendar for Lena".
export function letterTitle(templateId: string, recipientName: string | null | undefined): string {
  return `${letterNoun(templateId)} for ${wholeName(recipientName)}`
}

// Generic link-preview text. Never the message, the gift or the place.
export function letterDescription(recipientName: string | null | undefined): string {
  return `Made for ${wholeName(recipientName)} with Majnu.`
}

// "With all my love" + "Javier". When the sign-off already names the sender
// ("Love, Lea and Max"), the name is not repeated underneath.
export function signOffLines(signOff: string, senderName: string): { line: string; name: string | null } {
  const line = (signOff ?? "").trim()
  const name = (senderName ?? "").trim()
  if (!name) return { line, name: null }
  if (line.toLowerCase().includes(name.toLowerCase())) return { line, name: null }
  const withComma = line && !/[,.!?…:;]$/.test(line) ? `${line},` : line
  return { line: withComma, name }
}

// "Clara and Ben" -> "C & B", "Mia" -> "M". Used for monograms and wax seals.
export function monogram(senderName: string | null | undefined): string {
  const parts = (senderName ?? "")
    .split(/\s+(?:and|&|\+|und|y|et|e)\s+|\s*&\s*/i)
    .map((p) => p.trim())
    .filter(Boolean)
  const initials = parts.map((p) => Array.from(p)[0]?.toUpperCase() ?? "").filter(Boolean)
  if (initials.length === 2) return `${initials[0]} & ${initials[1]}`
  return initials[0] ?? "M"
}
