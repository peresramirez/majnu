// Names and titles shown around a letter. Page titles and link previews use
// these and nothing else from the content, so they never leak the message.
import type { TemplateId } from "@/lib/letters/schema"

// "Anna Schmidt" -> "Anna". Falls back to "you" when there is no name.
export function firstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? ""
  const clean = first.replace(/[.,;:!?]+$/, "").slice(0, 40)
  return clean || "you"
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
  "advent-classic": "An advent calendar",
  countdown: "A countdown",
}

// "A letter", "An invitation", "An advent calendar". Unknown ids are letters.
export function letterNoun(templateId: string | null | undefined): string {
  return nouns[templateId as TemplateId] ?? "A letter"
}

// "A letter for Anna", "An invitation for Sophie", "An advent calendar for Lena".
export function letterTitle(templateId: string, recipientName: string | null | undefined): string {
  return `${letterNoun(templateId)} for ${firstName(recipientName)}`
}

// Generic link-preview text. Never the message, the gift or the place.
export function letterDescription(recipientName: string | null | undefined): string {
  return `Made for ${firstName(recipientName)} with Majnu.`
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
