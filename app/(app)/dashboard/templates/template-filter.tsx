"use client"

// The filter chips on the Templates tab (All, Gifts, Letters, Invitations,
// Calendars). One is chosen at a time; the choice lives in the address
// (?type=gifts), so a reload or a shared link keeps it. Choosing a chip
// rewrites the address with history.replaceState, which Next.js picks up in
// useSearchParams: nothing navigates, nothing scrolls, and the Back button
// still leaves the tab rather than stepping through filters.
//
// The cards themselves are rendered on the server and passed in as children of
// <FilterSection>, which only decides whether its group is shown.
import { createContext, useCallback, useContext, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import type { TemplateCategory } from "@/lib/letters/templates"
import { focusRing } from "@/components/app/styles"
import { countLabel, FILTER_CHIPS, FILTER_PARAM, filterSearch, matchesFilter, parseTemplateFilter, type TemplateFilter } from "./filter"

const FilterContext = createContext<TemplateFilter>("all")

function useFilter(): [TemplateFilter, (next: TemplateFilter) => void] {
  const params = useSearchParams()
  const filter = parseTemplateFilter(params.get(FILTER_PARAM))
  const choose = useCallback((next: TemplateFilter) => {
    const { pathname, search, hash } = window.location
    // `null`, as Next.js documents: passing the current history.state (which
    // carries Next's own marker) would skip the router and leave
    // useSearchParams on the old value.
    window.history.replaceState(null, "", `${pathname}${filterSearch(next, search)}${hash}`)
  }, [])
  return [filter, choose]
}

export function TemplateFilterBar({ counts, children }: { counts: Record<TemplateFilter, number>; children: ReactNode }) {
  const [filter, choose] = useFilter()
  const shown = counts[filter]
  return (
    <FilterContext.Provider value={filter}>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Show templates for" className="-mx-1 flex flex-wrap gap-2 px-1">
          {FILTER_CHIPS.map((chip) => {
            const active = chip.id === filter
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={active}
                onClick={() => choose(chip.id)}
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors duration-200 ease-calm ${
                  active ? "bg-night-petal text-night-plum" : "text-night-lilac ring-1 ring-inset ring-night-petal/15 hover:text-night-petal hover:ring-night-petal/35"
                } ${focusRing}`}
              >
                {chip.label}
                {/* The status line below says the number out loud. */}
                <span aria-hidden="true" className={`tabular-nums ${active ? "text-night-plum/60" : "text-night-lilac/70"}`}>
                  {counts[chip.id]}
                </span>
              </button>
            )
          })}
        </div>
        <p role="status" className="text-[13px] tabular-nums text-night-lilac">
          {countLabel(filter, shown)}
        </p>
      </div>

      {shown === 0 ? (
        <div className="mt-10 rounded-3xl px-6 py-10 text-center ring-1 ring-inset ring-night-petal/10">
          <p className="font-display text-[24px] leading-tight text-night-petal">No templates in this group yet</p>
          <p className="mx-auto mt-2 max-w-[44ch] text-[14px] leading-relaxed text-night-lilac">Pick another group above, or see every template.</p>
          <button
            type="button"
            onClick={() => choose("all")}
            className={`mt-5 inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold text-night-petal ring-1 ring-inset ring-night-petal/25 hover:ring-night-petal/50 ${focusRing}`}
          >
            Show all templates
          </button>
        </div>
      ) : null}

      {children}
    </FilterContext.Provider>
  )
}

// One group of cards. Hidden (and out of the accessibility tree) when another
// group is chosen; the cards stay mounted, so a preview's state is never lost.
export function FilterSection({ category, children, ...rest }: { category: TemplateCategory; children: ReactNode; id: string; "aria-labelledby": string; className?: string }) {
  const filter = useContext(FilterContext)
  return (
    <section {...rest} hidden={!matchesFilter(filter, category)}>
      {children}
    </section>
  )
}
