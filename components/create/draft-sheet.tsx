"use client"

// The page while Majnu writes it (issue #30), in the preview's frame: the
// headline first, then the paragraphs, then the gifts, the event or the doors,
// as the builder streams them. Fields not written yet are quiet placeholders,
// and the part being written ends in a caret. It is a writing surface, not the
// template: the template, with its envelope or box, appears once the content is
// saved and the preview reloads. Drafts carry no gift codes or links.
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react"
import { WaxingMoon } from "@/components/app/waxing-moon"
import { eyebrow } from "@/components/app/styles"
import type { CalendarDraft, DraftGift, LetterDraft } from "@/lib/agents/events"
import { getTemplate } from "@/lib/letters/templates"
import { changedSlot, eventWhen, slotsOf, type DraftView } from "./draft-state"

// New parts fade and rise into place, only when reduced motion is off.
const fillIn = "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"

// Drafts come from our server, but only text is ever rendered.
const str = (v: unknown): string => (typeof v === "string" ? v : "")

function Caret() {
  return <span aria-hidden="true" className="ml-0.5 inline-block h-[0.95em] w-[2px] translate-y-[0.14em] rounded-full bg-night-rose motion-safe:animate-pulse" />
}

function Placeholder({ className }: { className: string }) {
  return <span aria-hidden="true" className={`block rounded-full bg-night-petal/10 motion-safe:animate-pulse ${className}`} />
}

// A piece of text; the one being written carries the caret and is followed on screen.
function Piece({ slot, active, className, children }: { slot: string; active: string | null; className?: string; children: ReactNode }) {
  const isActive = slot === active
  return (
    <div className={`${fillIn} ${className ?? ""}`} data-active={isActive ? "" : undefined}>
      {children}
      {isActive && <Caret />}
    </div>
  )
}

function GiftItem({ gift }: { gift: DraftGift }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium text-night-petal">{str(gift.title)}</p>
        {gift.price && <p className="flex-none text-sm font-semibold text-night-rose">{str(gift.price)}</p>}
      </div>
      {gift.description && <p className="mt-1 text-[15px] leading-relaxed text-night-lilac">{str(gift.description)}</p>}
    </>
  )
}

const card = "rounded-2xl bg-night-plum/70 p-4 ring-1 ring-inset ring-night-petal/10"

function LetterBody({ c, active, writing }: { c: LetterDraft; active: string | null; writing: boolean }) {
  const body = Array.isArray(c.body) ? c.body : null
  const when = eventWhen(c.event?.startsAt)
  return (
    <>
      {c.recipientName && (
        <p className={eyebrow}>
          For {str(c.recipientName)}
          {c.occasion ? ` · ${str(c.occasion)}` : ""}
        </p>
      )}
      {c.headline ? (
        <Piece slot="headline" active={active} className="mt-3">
          <h2 className="inline font-display text-[28px] leading-[1.15] text-night-petal">{str(c.headline)}</h2>
        </Piece>
      ) : writing ? (
        <div className="mt-4 grid gap-2">
          <Placeholder className="h-6 w-4/5" />
          <Placeholder className="h-6 w-1/2" />
        </div>
      ) : null}

      {body ? (
        body.map((p, i) => (
          <Piece key={i} slot={`body.${i}`} active={active} className="mt-4 whitespace-pre-wrap text-[16px] leading-relaxed text-night-petal/90">
            {str(p)}
          </Piece>
        ))
      ) : writing ? (
        <div className="mt-6 grid gap-2.5">
          <Placeholder className="h-3 w-full" />
          <Placeholder className="h-3 w-11/12" />
          <Placeholder className="h-3 w-4/5" />
          <Placeholder className="mt-3 h-3 w-full" />
          <Placeholder className="h-3 w-2/3" />
        </div>
      ) : null}

      {c.signOff && (
        <Piece slot="signOff" active={active} className="mt-6 text-[16px] text-night-petal/90">
          {str(c.signOff)}
        </Piece>
      )}
      {c.senderName && (
        <Piece slot="senderName" active={active} className="mt-1 font-display text-xl text-night-petal">
          {str(c.senderName)}
        </Piece>
      )}

      {c.event && (
        <Piece slot="event" active={active} className={`mt-6 ${card}`}>
          {c.event.title && <p className="font-medium text-night-petal">{str(c.event.title)}</p>}
          {when && <p className="mt-1 text-[15px] text-night-petal/90">{when}</p>}
          {c.event.locationName && <p className="mt-1 text-[15px] text-night-lilac">{str(c.event.locationName)}</p>}
          {c.event.address && <p className="text-[15px] text-night-lilac">{str(c.event.address)}</p>}
        </Piece>
      )}

      {Array.isArray(c.gifts) && c.gifts.length > 0 && (
        <ul className="mt-6 grid gap-2" aria-label="Gifts">
          {c.gifts.map((g, i) => (
            <li key={i}>
              <Piece slot={`gifts.${i}`} active={active} className={card}>
                <GiftItem gift={g} />
              </Piece>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function CalendarBody({ c, active, writing }: { c: CalendarDraft; active: string | null; writing: boolean }) {
  const starts = eventWhen(c.startDate)
  const doors = Array.isArray(c.doors) ? c.doors : []
  return (
    <>
      {c.recipientName && (
        <p className={eyebrow}>
          For {str(c.recipientName)}
          {starts ? ` · from ${starts}` : ""}
        </p>
      )}
      {c.headline ? (
        <Piece slot="headline" active={active} className="mt-3">
          <h2 className="inline font-display text-[28px] leading-[1.15] text-night-petal">{str(c.headline)}</h2>
        </Piece>
      ) : writing ? (
        <div className="mt-4 grid gap-2">
          <Placeholder className="h-6 w-3/4" />
        </div>
      ) : null}
      {c.intro && (
        <Piece slot="intro" active={active} className="mt-4 text-[16px] leading-relaxed text-night-petal/90">
          {str(c.intro)}
        </Piece>
      )}
      {doors.length > 0 && (
        <ol className="mt-6 grid gap-2" aria-label="Doors">
          {doors.map((door, i) => (
            <li key={i}>
              <Piece slot={`doors.${i}`} active={active} className={`flex gap-3 ${card}`}>
                <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-night-velvet text-sm font-semibold text-night-rose">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  {door.title && <span className="block font-medium text-night-petal">{str(door.title)}</span>}
                  {door.message && <span className="mt-0.5 block text-[15px] leading-relaxed text-night-lilac">{str(door.message)}</span>}
                  {door.gift?.title && <span className="mt-1 block text-sm font-semibold text-night-rose">{str(door.gift.title)}</span>}
                </span>
              </Piece>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

export function DraftSheet({ draft }: { draft: DraftView }) {
  const writing = draft.phase === "writing"
  const slots = slotsOf(draft)
  const previous = useRef(new Map<string, string>())
  const lastActive = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Set when the person scrolls the draft themselves: following stops for a while.
  const readingSince = useRef(0)

  const active = writing ? (changedSlot(previous.current, slots) ?? lastActive.current) : null

  useEffect(() => {
    previous.current = new Map(slots.map((s) => [s.key, s.text]))
    lastActive.current = active
  })

  // Keep the part being written in view, unless the person is reading further up.
  useLayoutEffect(() => {
    const box = scrollRef.current
    const el = box?.querySelector<HTMLElement>("[data-active]")
    if (!box || !el || Date.now() - readingSince.current < 4000) return
    const boxRect = box.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    const overflow = rect.bottom - (boxRect.bottom - 32)
    if (overflow <= 0) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    box.scrollTo({ top: box.scrollTop + overflow, behavior: reduce ? "auto" : "smooth" })
  })

  const templateName = getTemplate(draft.templateId)?.name
  const markReading = () => {
    readingSince.current = Date.now()
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-night-velvet text-left" aria-busy={writing}>
      <div className="flex flex-none items-center gap-2 border-b border-night-petal/10 px-5 py-3 text-[13px] text-night-lilac">
        <WaxingMoon size={16} className="flex-none text-night-rose" />
        <span role="status">{writing ? "Majnu is writing…" : "Opening the page…"}</span>
        {templateName && <span className="ml-auto truncate">{templateName}</span>}
      </div>
      <div
        ref={scrollRef}
        onWheel={markReading}
        onTouchMove={markReading}
        tabIndex={0}
        aria-label="Draft of the page"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-10 pt-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-night-rose"
      >
        {draft.kind === "letter" ? (
          <LetterBody c={draft.content} active={active} writing={writing} />
        ) : (
          <CalendarBody c={draft.content} active={active} writing={writing} />
        )}
      </div>
    </div>
  )
}
