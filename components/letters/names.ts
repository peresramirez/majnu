// Names and titles shown around a letter. Page titles and link previews use
// these and nothing else from the content, so they never leak the message.
import { isGroup, shortName } from "@/lib/letters/names"
import type { TemplateId } from "@/lib/letters/schema"

export { firstName, isGroup, shortName, wholeName } from "@/lib/letters/names"

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
// One person by the first name only (shortName).
export function letterTitle(templateId: string, recipientName: string | null | undefined): string {
  return `${letterNoun(templateId)} for ${shortName(recipientName)}`
}

// Generic link-preview text. Never the message, the gift, the place or a surname.
export function letterDescription(recipientName: string | null | undefined): string {
  return `Made for ${shortName(recipientName)} with Majnu.`
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
