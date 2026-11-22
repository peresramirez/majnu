import { eyebrow, pagePadding } from "@/components/app/styles"
import { TemplateCard } from "@/components/letters/template-card"
import { templateCategories, templates, type TemplateCategory } from "@/lib/letters/templates"
import { filterCounts } from "./filter"
import { TemplateActions } from "./template-actions"
import { FilterSection, TemplateFilterBar } from "./template-filter"

const blurbs: Record<TemplateCategory, string> = {
  gift: "Pages that hold a gift card, a voucher or a code, revealed when they open it.",
  letter: "A letter for one person, to read and keep.",
  invitation: "The date, time and place, with a map link and a calendar file. Wedding and party invitations can carry a gift list.",
  calendar: "One door a day, opening at midnight. Guests need an account for these, so they can come back day after day.",
}

// The Templates tab: every template, grouped, each with a still thumbnail
// (<TemplateCard>, rendered on the server), a preview in a modal and a "Use
// this template" link that starts a new gift with it chosen. The filter chips
// above the groups show one group at a time (?type=, see ./filter.ts). `guest`
// swaps the calendar cards' link for sign-up, since the chat refuses calendars
// to guests.
export function TemplatesView({ guest }: { guest: boolean }) {
  return (
    <div className={`max-w-6xl ${pagePadding}`}>
      <p className={eyebrow}>Templates</p>
      <h1 className="mt-2 font-display text-[34px] leading-tight text-night-petal md:text-[42px]">Choose how it opens</h1>
      <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-night-lilac">
        Preview any template with example words, then start a gift with it. Majnu writes your message into the one you choose, and you can switch later.
      </p>

      <TemplateFilterBar counts={filterCounts()}>
        {templateCategories.map((c) => {
          const inGroup = templates.filter((t) => t.category === c.id)
          if (!inGroup.length) return null
          return (
            <FilterSection key={c.id} category={c.id} id={c.id} aria-labelledby={`${c.id}-title`} className="mt-12 scroll-mt-6">
              <h2 id={`${c.id}-title`} className="font-display text-[26px] leading-tight text-night-petal">
                {c.label}
              </h2>
              <p className="mt-1 max-w-[60ch] text-[14px] leading-relaxed text-night-lilac">{blurbs[c.id]}</p>
              <ul className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-4">
                {inGroup.map((t) => (
                  <li key={t.id}>
                    <TemplateCard id={t.id} orientation="responsive" className="h-full">
                      {t.kind === "calendar" ? (
                        <span className="mt-2 block text-[13px] leading-snug text-night-lilac/90">Needs an account for guests.</span>
                      ) : null}
                      <TemplateActions id={t.id} name={t.name} description={t.description} needsAccount={guest && t.kind === "calendar"} />
                    </TemplateCard>
                  </li>
                ))}
              </ul>
            </FilterSection>
          )
        })}
      </TemplateFilterBar>
    </div>
  )
}
