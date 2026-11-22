// How a recipient (or a host) is named: the first name, the whole name, or
// the rule titles and previews use (shortName). Pure and free of components,
// so server code such as titleFor() in lib/agents/builder.ts and the pages in
// components/letters/ share one rule (re-exported from components/letters/names.ts).

// "Anna Schmidt" -> "Anna". Falls back to "you" when there is no name.
// Gift pages use wholeName() instead, so "our friends" and "Mia and Leo" stay
// whole; titles and previews use shortName().
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

// How titles, link previews and a page's metadata name the recipient (and
// the calendar's "For …"): the first name of one person, so a surname never
// reaches a preview or a stored title ("Anna Schmidt" -> "Anna"; docs/plan.md
// and AGENTS.md keep them generic), and the whole phrase for a group, whose first word
// alone reads wrongly ("our friends", "Mia & Leo", "the Smiths"). "you" when
// there is no name.
export function shortName(name: string | null | undefined): string {
  return isGroup(name) ? wholeName(name) : firstName(name)
}
