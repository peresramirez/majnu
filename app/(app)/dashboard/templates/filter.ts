// The Templates tab's filter, as plain data: which chip is chosen, how it is
// written in the address (?type=gifts and so on, so a reload or a shared link
// keeps it), which templates it shows and how the count reads. Kept apart from
// the components so it can be unit-tested (the test runner cannot load .tsx).
import { templateCategories, templates, type TemplateCategory, type TemplateMeta } from "@/lib/letters/templates"

export type TemplateFilter = "all" | TemplateCategory

// The query parameter and its values. "All" is the address without one.
export const FILTER_PARAM = "type"

const PARAM_VALUES: Record<TemplateCategory, string> = {
  gift: "gifts",
  letter: "letters",
  invitation: "invitations",
  calendar: "calendars",
}

// Words for the count line, singular and plural.
const NOUNS: Record<TemplateFilter, [string, string]> = {
  all: ["template", "templates"],
  gift: ["gift template", "gift templates"],
  letter: ["letter template", "letter templates"],
  invitation: ["invitation template", "invitation templates"],
  calendar: ["calendar template", "calendar templates"],
}

// The chips, in order: All, then the groups as the tab lists them.
export const FILTER_CHIPS: { id: TemplateFilter; label: string }[] = [
  { id: "all", label: "All" },
  ...templateCategories.map((c) => ({ id: c.id, label: c.label })),
]

// The chosen filter from a ?type= value. Anything unknown, empty or repeated
// strangely falls back to All, so an old or mistyped link still shows every
// template. Accepts the singular too (?type=gift), and any letter case.
export function parseTemplateFilter(value: string | string[] | null | undefined): TemplateFilter {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim().toLowerCase()
  if (!raw) return "all"
  for (const [category, param] of Object.entries(PARAM_VALUES) as [TemplateCategory, string][]) {
    if (raw === param || raw === category) return category
  }
  return "all"
}

// The ?type= value for a filter, or null for All.
export function filterParam(filter: TemplateFilter): string | null {
  return filter === "all" ? null : PARAM_VALUES[filter]
}

// The query string for `filter`, keeping every other parameter in `search` as
// it is. Returns "" for All with nothing else, otherwise "?…".
export function filterSearch(filter: TemplateFilter, search = ""): string {
  const params = new URLSearchParams(search)
  const value = filterParam(filter)
  if (value) params.set(FILTER_PARAM, value)
  else params.delete(FILTER_PARAM)
  const query = params.toString()
  return query ? `?${query}` : ""
}

export function matchesFilter(filter: TemplateFilter, category: TemplateCategory): boolean {
  return filter === "all" || filter === category
}

export function templatesFor(filter: TemplateFilter, list: readonly TemplateMeta[] = templates): TemplateMeta[] {
  return list.filter((t) => matchesFilter(filter, t.category))
}

// How many templates each chip shows.
export function filterCounts(list: readonly TemplateMeta[] = templates): Record<TemplateFilter, number> {
  const counts = { all: list.length, gift: 0, letter: 0, invitation: 0, calendar: 0 } satisfies Record<TemplateFilter, number>
  for (const t of list) counts[t.category] += 1
  return counts
}

// "11 templates", "3 gift templates", "1 calendar template", "No calendar templates yet".
export function countLabel(filter: TemplateFilter, shown: number): string {
  const [one, many] = NOUNS[filter]
  if (shown === 0) return `No ${many} yet`
  return `${shown} ${shown === 1 ? one : many}`
}
