// The link-preview image for a letter (app/(public)/l/[slug]/opengraph-image.tsx):
// a cream envelope on the night sky, sealed with the crescent, addressed to the
// recipient by the name the sender gave ("Anna", "our friends"). It takes the
// kind of gift and that name and nothing else, so no message, gift, code,
// place or date can reach a preview.
//
// This file holds the rules (who it is addressed to, how big the name is);
// og-envelope-image.tsx draws it. Pure, so the rules can be tested.
import type { PublicLetter } from "@/lib/letters/schema"
import { letterNoun, wholeName } from "./names"

export const OG_SIZE = { width: 1200, height: 630 }

// The characters the embedded Gilda Display subset can draw. A name with
// anything else (another script, an emoji) is shown as "you": next/og would
// otherwise ask Google Fonts for the missing glyphs and send the name with it.
const DRAWABLE = /^[\u0020-\u007E\u00A0-\u00AC\u00AE-\u017E\u2013\u2014\u2018-\u201E\u2026]+$/

export function envelopeName(letter: Pick<PublicLetter, "content"> | null): string {
  const name = wholeName(letter?.content.recipientName)
  return DRAWABLE.test(name) ? name : "you"
}

export function envelopeKind(letter: Pick<PublicLetter, "templateId"> | null): string {
  return letterNoun(letter?.templateId)
}

// Long names shrink to stay on the envelope (about 520 px of writing line).
export function nameFontSize(name: string): number {
  const length = Array.from(name).length
  return Math.max(28, Math.min(104, Math.floor(1040 / Math.max(length, 1))))
}
