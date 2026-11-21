"use client"

import { Check } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { focusRing } from "@/components/app/styles"
import { templates, type TemplateMeta } from "@/lib/letters/templates"
import { TemplateIcon } from "./template-bits"

const groups = [
  { kind: "letter", label: "Letters, gifts and invitations" },
  { kind: "calendar", label: "Calendars" },
] as const

// The Template button's sheet: every template as a card. Choosing one attaches
// it to the message being written; nothing is sent until the person sends.
export function TemplatePicker({
  open,
  onOpenChange,
  selectedId,
  onChoose,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedId: string | null
  onChoose: (template: TemplateMeta) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="dark max-h-[88dvh] overflow-y-auto rounded-t-[28px] border-night-petal/10 bg-night-plum px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 text-night-petal sm:px-6 md:mx-auto md:max-w-3xl"
      >
        <SheetHeader className="pr-8 text-left">
          <SheetTitle className="font-display text-[28px] font-normal leading-tight text-night-petal">Choose a template</SheetTitle>
          <SheetDescription className="text-[15px] text-night-lilac">
            Majnu writes your gift into the one you pick. You can switch later.
          </SheetDescription>
        </SheetHeader>

        {groups.map((group) => (
          <section key={group.kind} aria-label={group.label} className="mt-7">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-night-lilac">{group.label}</h3>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {templates
                .filter((t) => t.kind === group.kind)
                .map((t) => {
                  const selected = t.id === selectedId
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onChoose(t)}
                        className={`flex h-full w-full gap-3.5 rounded-2xl bg-night-velvet p-4 text-left ring-inset transition-shadow duration-200 ease-calm ${focusRing} ${
                          selected ? "ring-2 ring-night-rose" : "ring-1 ring-night-petal/10 hover:ring-night-rose/40"
                        }`}
                      >
                        <span className="mt-1 flex-none text-night-rose">
                          <TemplateIcon id={t.id} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="font-display text-xl leading-snug">{t.name}</span>
                            {selected ? (
                              <Check className="mt-1 h-5 w-5 flex-none text-night-rose" aria-hidden="true" />
                            ) : null}
                          </span>
                          <span className="mt-1 block text-[15px] leading-relaxed text-night-lilac">{t.description}</span>
                          <span className="mt-2 hidden text-[13px] text-night-lilac/80 sm:block">For {t.bestFor.slice(0, 3).join(", ")}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
            </ul>
          </section>
        ))}
      </SheetContent>
    </Sheet>
  )
}
