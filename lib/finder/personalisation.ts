// How well Majnu knows the person so far (issue #97): a score from 0 to 100
// and the one addition that would raise it most, shown as a small meter next
// to "Their profile so far" in the finder. Pure, and free of server code, so
// the route computes it with each `context` event and tests check it alone.
//
// The weights add up to 100. A public profile counts most, because it gives
// the search interests the visitor might not think to mention; an exact name
// counts least, because it changes the wrapping more than the gift.
import type { FinderContext } from "./events"

export type PersonalisationNext = {
  key: PersonalisationKey
  // What to add, for the hint line: "Add their Instagram".
  label: string
  // Points it would add.
  gain: number
}

export type Personalisation = { score: number; next: PersonalisationNext | null }

export type PersonalisationKey =
  | "relationship"
  | "age"
  | "occasion"
  | "budget"
  | "interests"
  | "name"
  | "profile"
  | "notes"
  | "own_words"

export type PersonalisationInput = {
  context: FinderContext | null
  // Public profiles or pages read for this person (issue #89), whatever they gave.
  profilesRead?: number
  // Answers the visitor typed in their own words ("Other", issue #97).
  ownAnswers?: number
}

// Points for each thing Majnu knows. Interests, notes and own words count per
// item, up to a cap.
export const PERSONALISATION_WEIGHTS = {
  relationship: 10,
  age: 8,
  occasion: 10,
  budget: 8,
  interestEach: 6,
  interestMax: 3,
  name: 6,
  profile: 20,
  noteEach: 5,
  noteMax: 2,
  ownWordsEach: 5,
  ownWordsMax: 2,
} as const

const LABELS: Record<PersonalisationKey, string> = {
  profile: "Add their Instagram, TikTok or LinkedIn",
  interests: "Say what they love",
  relationship: "Say who it is for",
  occasion: "Name the occasion",
  notes: "Share a photo or a wishlist",
  own_words: "Answer a question in your own words",
  age: "Tell Majnu their age",
  budget: "Give a budget",
  name: "Tell Majnu their name",
}

// Equal gains are offered in this order: the profile first, then what the
// person loves.
const ORDER: PersonalisationKey[] = ["profile", "interests", "relationship", "occasion", "notes", "own_words", "age", "budget", "name"]

const has = (value: string | undefined) => typeof value === "string" && value.trim() !== ""
const count = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)

export function personalisationScore(input: PersonalisationInput): Personalisation {
  const w = PERSONALISATION_WEIGHTS
  const context = input.context ?? { language: "" }
  const interests = Math.min(new Set((context.interests ?? []).map((i) => i.trim().toLowerCase()).filter(Boolean)).size, w.interestMax)
  const notes = Math.min((context.notes ?? []).filter((n) => n.trim()).length, w.noteMax)
  const ownWords = Math.min(count(input.ownAnswers), w.ownWordsMax)
  const age = context.ageRange?.length === 2 && context.ageRange.every((n) => Number.isFinite(n))

  const earned: Record<PersonalisationKey, number> = {
    relationship: has(context.relationship) ? w.relationship : 0,
    age: age ? w.age : 0,
    occasion: has(context.occasion) ? w.occasion : 0,
    budget: has(context.budget) ? w.budget : 0,
    interests: interests * w.interestEach,
    name: has(context.name) ? w.name : 0,
    profile: count(input.profilesRead) > 0 ? w.profile : 0,
    notes: notes * w.noteEach,
    own_words: ownWords * w.ownWordsEach,
  }
  // What the next addition of each kind would add: one more interest, note or
  // own answer, or the whole weight of the rest.
  const gains: Record<PersonalisationKey, number> = {
    relationship: w.relationship - earned.relationship,
    age: w.age - earned.age,
    occasion: w.occasion - earned.occasion,
    budget: w.budget - earned.budget,
    interests: interests < w.interestMax ? w.interestEach : 0,
    name: w.name - earned.name,
    profile: w.profile - earned.profile,
    notes: notes < w.noteMax ? w.noteEach : 0,
    own_words: ownWords < w.ownWordsMax ? w.ownWordsEach : 0,
  }
  const score = Math.min(100, Object.values(earned).reduce((sum, n) => sum + n, 0))
  let next: PersonalisationNext | null = null
  for (const key of ORDER) if (gains[key] > 0 && (!next || gains[key] > next.gain)) next = { key, label: LABELS[key], gain: gains[key] }
  return { score, next }
}

// Answers the visitor typed for "Other" in these messages: the finder sends
// each as "Label: other: their words." (components/finder/finder-state.ts).
export function countOwnAnswers(messages: readonly string[]): number {
  return messages.reduce((sum, text) => sum + (text.match(/(?:^|[\s.:])other:\s*\S/gi)?.length ?? 0), 0)
}
