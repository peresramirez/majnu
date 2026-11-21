// What Majnu assumed before searching (FinderContext), as small chips the
// visitor can correct. Tapping a chip starts a correction in the message box
// ("They're actually "), so the fix goes to Majnu as an ordinary message.
import type { FinderContext } from "@/lib/finder/events"

export type ContextChip = {
  key: string
  label: string // what the chip shows
  description: string // what a screen reader hears: what it is and that it can be changed
  prefill: string // what the message box starts with when the chip is tapped
}

function displayName(type: "region" | "language", code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale, "en"], { type }).of(code) ?? code
  } catch {
    return code
  }
}

const capitalise = (s: string) => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s)

// `locale` is the language the chips are written in (the page is English).
export function contextChips(context: FinderContext | null, locale = "en"): ContextChip[] {
  if (!context) return []
  const chips: ContextChip[] = []
  // "mother", "my mother" and "a colleague" all read as "Your mother", "Your colleague".
  const relationship = context.relationship?.trim().replace(/^(my|your|a|an|the)\s+/i, "")
  if (relationship) {
    chips.push({
      key: "relationship",
      label: `Your ${relationship}`,
      description: `For your ${relationship}. Change who it is for`,
      prefill: "It's for my ",
    })
  }
  const age = context.ageRange
  if (age && age.length === 2 && Number.isFinite(age[0]) && Number.isFinite(age[1])) {
    const [from, to] = age[0] <= age[1] ? age : [age[1], age[0]]
    chips.push({
      key: "age",
      label: from === to ? `About ${from}` : `About ${from}–${to}`,
      description: from === to ? `About ${from} years old. Change the age` : `About ${from} to ${to} years old. Change the age`,
      prefill: "They're ",
    })
  }
  if (context.budget) {
    chips.push({ key: "budget", label: capitalise(context.budget), description: `Budget ${context.budget}. Change the budget`, prefill: "My budget is " })
  }
  if (context.interests?.length) {
    const shown = context.interests.slice(0, 3).join(", ")
    chips.push({ key: "interests", label: `Likes ${shown}`, description: `Likes ${shown}. Add what they like`, prefill: "They also love " })
  }
  if (context.country) {
    const country = displayName("region", context.country.toUpperCase(), locale)
    chips.push({ key: "country", label: country, description: `Shops in ${country}. Change the country`, prefill: "Look for shops in " })
  }
  if (context.language) {
    const language = displayName("language", context.language, locale)
    chips.push({ key: "language", label: language, description: `Answers in ${language}. Change the language`, prefill: "Please answer in " })
  }
  return chips
}
