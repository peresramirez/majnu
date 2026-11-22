"use client"

// What is behind one door (issue #48): one of Majnu's ideas, the sender's own
// gift, or a note only, and the door's note. A sheet from the bottom on phones,
// a dialog on larger screens. Saving goes through the door route, which copies
// a chosen idea from the stored pool, so this only sends the idea's id.
import { useEffect, useId, useState, type ReactNode } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ExternalLink, Gift, PenLine, Sparkles, X } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { focusRing, primaryButton, secondaryButton, smallButton } from "@/components/app/styles"
import { NOTE_LIMITS, optionForGift } from "@/lib/calendars/doors"
import type { DoorRequest } from "@/lib/calendars/types"
import type { GiftOption } from "@/lib/finder/events"
import type { CalendarDoor } from "@/lib/letters/schema"
import { formatDay } from "./dates"

type Tab = "idea" | "own" | "note"

const field =
  "mt-1.5 block w-full rounded-xl bg-night-velvet px-3.5 py-2.5 text-[16px] text-night-petal ring-1 ring-inset ring-night-petal/15 placeholder:text-night-lilac/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-night-rose"
const label = "block text-[14px] font-semibold text-night-petal"

export type PickerProps = {
  door: CalendarDoor | null
  opensOn: string
  total: number
  pool: GiftOption[]
  lastDoorId: string | null
  // Which doors already hold each idea, by the idea's link.
  usedIn: Map<string, number[]>
  findingSimilar: string | null
  poolBusy: boolean
  onClose: () => void
  // After the picker has closed: the editor puts focus back on the door's tile.
  onClosed: () => void
  onSave: (day: number, body: DoorRequest) => Promise<string | null>
  onMoreLikeThis: (optionId: string) => void
  onFindIdeas: () => void
}

function initialTab(door: CalendarDoor, pool: GiftOption[]): Tab {
  if (door.gift) return optionForGift(door.gift, pool) ? "idea" : "own"
  if (door.message.trim()) return "note"
  return pool.length ? "idea" : "own"
}

function IdeaRow({
  option,
  selected,
  onSelect,
  usedIn,
  suggestedForLast,
  finding,
  disabled,
  onMoreLikeThis,
  name,
}: {
  option: GiftOption
  selected: boolean
  onSelect: () => void
  usedIn: number[]
  suggestedForLast: boolean
  finding: boolean
  disabled: boolean
  onMoreLikeThis: () => void
  name: string
}) {
  const id = useId()
  return (
    <li
      data-picker-chosen={selected || undefined}
      className={`relative rounded-2xl bg-night-velvet p-3 transition-shadow duration-200 ease-calm has-[input:focus-visible]:outline has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-night-rose ${
        selected ? "ring-2 ring-night-rose" : "ring-1 ring-night-petal/10 hover:ring-night-petal/25"
      }`}
    >
      <div className="flex gap-3">
        <input
          id={id}
          type="radio"
          name={name}
          checked={selected}
          onChange={onSelect}
          className="peer sr-only"
          aria-describedby={`${id}-meta`}
        />
        <div className="h-16 w-16 flex-none overflow-hidden rounded-xl bg-night-plum">
          {option.imageUrl ? (
            // Shop photos show to the sender only; the door itself never loads them.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={option.imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-night-rose/70">
              <Gift className="h-6 w-6" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {/* The label covers the whole card, so tapping anywhere chooses it. */}
          <label htmlFor={id} className="block cursor-pointer text-[15px] font-semibold leading-snug after:absolute after:inset-0 after:rounded-2xl">
            {option.title}
          </label>
          <p id={`${id}-meta`} className="mt-0.5 text-[13px] text-night-lilac">
            {[option.price, option.shop].filter(Boolean).join(" · ")}
            {usedIn.length ? <span className="text-night-orchid"> · In door {usedIn.join(", ")}</span> : null}
            {suggestedForLast ? <span className="text-night-rose"> · Suggested for the last door</span> : null}
          </p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-night-petal/80">{option.description}</p>
          <div className="relative z-10 mt-2 flex gap-2">
            <button type="button" onClick={onMoreLikeThis} disabled={disabled} className={`${smallButton} px-3 py-1.5 text-[13px]`}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {finding ? "Looking…" : "More like this"}
            </button>
            <a href={option.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className={`${smallButton} px-3 py-1.5 text-[13px]`}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              See it
              <span className="sr-only">in the shop (opens in a new tab)</span>
            </a>
          </div>
        </div>
      </div>
    </li>
  )
}

function TabButton({ tab, current, onSelect, children }: { tab: Tab; current: Tab; onSelect: (tab: Tab) => void; children: ReactNode }) {
  const selected = tab === current
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect(tab)}
      className={`flex-1 whitespace-nowrap rounded-full px-2 py-2 text-[14px] font-semibold sm:px-3 transition-colors duration-200 ease-calm ${focusRing} ${
        selected ? "bg-night-petal text-night-plum" : "text-night-lilac hover:text-night-petal"
      }`}
    >
      {children}
    </button>
  )
}

export function DoorPicker(props: PickerProps) {
  const { door } = props
  return (
    <DialogPrimitive.Root open={door !== null} onOpenChange={(open) => (open ? null : props.onClose())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="picker-overlay fixed inset-0 z-50 bg-[#0c0812]/70" />
        <DialogPrimitive.Content
          // There is no Radix Trigger to return to, so the editor refocuses the door.
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            props.onClosed()
          }}
          // Start at the door's title, as the recipient's door dialog does, not on Close.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            ;(event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("[data-picker-title]")?.focus()
          }}
          className="picker-sheet dark fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[28px] bg-night-plum text-night-petal ring-1 ring-night-petal/10 focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[86dvh] sm:w-[min(640px,92vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px]"
        >
          {door ? <PickerBody key={door.day} {...props} door={door} /> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .picker-sheet[data-state="open"] { animation: picker-up 420ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
          .picker-overlay[data-state="open"] { animation: picker-fade 300ms ease-out both; }
          @media (min-width: 640px) { .picker-sheet[data-state="open"] { animation-name: picker-in; } }
        }
        @keyframes picker-up { from { opacity: 0; transform: translateY(32px); } }
        @keyframes picker-in { from { opacity: 0; transform: translate(-50%, calc(-50% + 16px)); } }
        @keyframes picker-fade { from { opacity: 0; } }
      `}</style>
    </DialogPrimitive.Root>
  )
}

function PickerBody(props: PickerProps & { door: CalendarDoor }) {
  const { door, pool } = props
  const matched = optionForGift(door.gift, pool)
  const [tab, setTab] = useState<Tab>(() => initialTab(door, pool))
  const [optionId, setOptionId] = useState<string | null>(matched?.id ?? null)
  const [own, setOwn] = useState(() =>
    door.gift && !matched
      ? { title: door.gift.title, url: door.gift.url ?? "", price: door.gift.price ?? "", code: door.gift.code ?? "", description: door.gift.description ?? "" }
      : { title: "", url: "", price: "", code: "", description: "" },
  )
  const [title, setTitle] = useState(door.title)
  const [message, setMessage] = useState(door.message)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ids = { title: useId(), message: useId(), ownTitle: useId(), ownUrl: useId(), ownPrice: useId(), ownCode: useId(), ownAbout: useId(), group: useId() }
  const isLast = door.day === props.total

  // A door that already holds an idea opens with that idea in view.
  // Only the picker's own list scrolls: scrollIntoView would move the page behind it too.
  useEffect(() => {
    const list = document.querySelector<HTMLElement>("[data-picker-scroll]")
    const chosen = list?.querySelector<HTMLElement>("[data-picker-chosen]")
    if (!list || !chosen) return
    const a = list.getBoundingClientRect()
    const b = chosen.getBoundingClientRect()
    list.scrollTop += b.top - a.top - (a.height - b.height) / 2
  }, [])

  // New ideas from "more like this" land at the end of the list: say so.
  const [poolSize, setPoolSize] = useState(pool.length)
  const [added, setAdded] = useState(0)
  useEffect(() => {
    if (pool.length > poolSize) setAdded(pool.length - poolSize)
    setPoolSize(pool.length)
  }, [pool.length, poolSize])

  const giftChoice: DoorRequest["gift"] =
    tab === "idea" ? (optionId ? { type: "idea", optionId } : null) : tab === "own" ? { type: "own", ...own } : null
  const valid =
    tab === "idea" ? optionId !== null : tab === "own" ? own.title.trim().length > 0 : message.trim().length > 0
  const filled = Boolean(door.gift) || door.message.trim().length > 0

  async function save(body: DoorRequest) {
    setSaving(true)
    setError(null)
    const problem = await props.onSave(door.day, body)
    setSaving(false)
    if (problem) setError(problem)
  }

  const missing =
    tab === "idea" ? "Choose one of the ideas." : tab === "own" ? "Write what the gift is." : "Write the note for this door."

  return (
    <>
      <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5 sm:px-7 sm:pt-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-night-lilac">
            Door {door.day} · {formatDay(props.opensOn)}
            {isLast ? " · the last door" : ""}
          </p>
          <DialogPrimitive.Title data-picker-title tabIndex={-1} className="mt-1.5 font-display text-[28px] leading-tight outline-none">What’s behind door {door.day}?</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Choose one of Majnu’s ideas, add your own gift, or leave a note only.</DialogPrimitive.Description>
        </div>
        <DialogPrimitive.Close
          className={`-mr-2 flex h-11 w-11 flex-none items-center justify-center rounded-full text-night-lilac transition-colors duration-200 hover:bg-night-petal/10 hover:text-night-petal ${focusRing}`}
          aria-label="Close"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </DialogPrimitive.Close>
      </div>

      <div data-picker-scroll className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-7">
        <div role="tablist" aria-label="What goes behind the door" className="flex gap-1 rounded-full bg-night-velvet p-1">
          <TabButton tab="idea" current={tab} onSelect={setTab}>
            <span className="sm:hidden">Ideas</span>
            <span className="hidden sm:inline">Majnu’s ideas</span>
            {pool.length ? ` (${pool.length})` : ""}
          </TabButton>
          <TabButton tab="own" current={tab} onSelect={setTab}>
            Your own
          </TabButton>
          <TabButton tab="note" current={tab} onSelect={setTab}>
            Note only
          </TabButton>
        </div>

        <div role="tabpanel" className="mt-5">
          {tab === "idea" ? (
            pool.length === 0 ? (
              <div className="rounded-2xl bg-night-velvet p-5 text-center">
                <MoonPhase lit={props.poolBusy ? 0.5 : 0} size={32} className="mx-auto text-night-rose" />
                <p className="mt-3 text-[15px] text-night-lilac">
                  {props.poolBusy ? "Majnu is still looking for ideas. They appear here in a moment." : "There are no ideas yet."}
                </p>
                {props.poolBusy ? null : (
                  <button type="button" onClick={props.onFindIdeas} className={`mt-4 ${secondaryButton}`}>
                    Find ideas
                  </button>
                )}
              </div>
            ) : (
              <fieldset>
                <legend className="sr-only">Majnu’s ideas</legend>
                <ul className="grid gap-2.5">
                  {pool.map((option) => (
                    <IdeaRow
                      key={option.id}
                      name={ids.group}
                      option={option}
                      selected={optionId === option.id}
                      onSelect={() => setOptionId(option.id)}
                      usedIn={(props.usedIn.get(option.url) ?? []).filter((d) => d !== door.day)}
                      suggestedForLast={isLast && option.id === props.lastDoorId}
                      finding={props.findingSimilar === option.id}
                      disabled={props.poolBusy}
                      onMoreLikeThis={() => props.onMoreLikeThis(option.id)}
                    />
                  ))}
                </ul>
                <p role="status" className="mt-3 text-[13px] text-night-lilac">
                  {props.findingSimilar ? "Looking for more like that one. They are added at the end of the list." : added ? `${added} new ideas added at the end of the list.` : ""}
                </p>
              </fieldset>
            )
          ) : tab === "own" ? (
            <div className="grid gap-4">
              <div>
                <label htmlFor={ids.ownTitle} className={label}>
                  What it is
                </label>
                <input id={ids.ownTitle} className={field} value={own.title} onChange={(e) => setOwn({ ...own, title: e.target.value })} maxLength={120} placeholder="Cinema voucher for two" />
              </div>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
                <div>
                  <label htmlFor={ids.ownUrl} className={label}>
                    Link <span className="font-normal text-night-lilac">(optional)</span>
                  </label>
                  <input id={ids.ownUrl} className={field} type="url" inputMode="url" value={own.url} onChange={(e) => setOwn({ ...own, url: e.target.value })} placeholder="https://" />
                </div>
                <div>
                  <label htmlFor={ids.ownPrice} className={label}>
                    Price <span className="font-normal text-night-lilac">(optional)</span>
                  </label>
                  <input id={ids.ownPrice} className={field} value={own.price} onChange={(e) => setOwn({ ...own, price: e.target.value })} maxLength={40} placeholder="12 €" />
                </div>
              </div>
              <div>
                <label htmlFor={ids.ownCode} className={label}>
                  Voucher code <span className="font-normal text-night-lilac">(optional)</span>
                </label>
                <input id={ids.ownCode} className={`${field} font-mono`} value={own.code} onChange={(e) => setOwn({ ...own, code: e.target.value })} maxLength={120} autoComplete="off" spellCheck={false} />
                <p className="mt-1.5 text-[13px] text-night-lilac">Shown only once they open this door.</p>
              </div>
              <div>
                <label htmlFor={ids.ownAbout} className={label}>
                  A line about it <span className="font-normal text-night-lilac">(optional)</span>
                </label>
                <input id={ids.ownAbout} className={field} value={own.description} onChange={(e) => setOwn({ ...own, description: e.target.value })} maxLength={300} />
              </div>
            </div>
          ) : (
            <p className="flex gap-3 rounded-2xl bg-night-velvet p-4 text-[15px] leading-relaxed text-night-lilac">
              <PenLine className="mt-0.5 h-5 w-5 flex-none text-night-rose" aria-hidden="true" />
              No gift behind this door. Your note is the gift: a memory, a small plan, a dare.
            </p>
          )}
        </div>

        <section aria-label="The note" className="mt-6 border-t border-night-petal/10 pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-night-lilac">The note behind the door</h3>
          <div className="mt-3 grid gap-4">
            <div>
              <label htmlFor={ids.title} className={label}>
                Title <span className="font-normal text-night-lilac">(optional)</span>
              </label>
              <input id={ids.title} className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={NOTE_LIMITS.title} placeholder="Something warm" />
            </div>
            <div>
              <label htmlFor={ids.message} className={label}>
                Note {tab === "note" ? null : <span className="font-normal text-night-lilac">(optional)</span>}
              </label>
              <textarea
                id={ids.message}
                className={`${field} min-h-[96px] resize-y`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={NOTE_LIMITS.message}
                aria-describedby={`${ids.message}-hint`}
              />
              <p id={`${ids.message}-hint`} className="mt-1.5 text-[13px] text-night-lilac">
                One to three sentences. Leave it empty and Majnu can write it with the others.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="flex flex-none flex-wrap items-center gap-3 border-t border-night-petal/10 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-7 sm:pb-6">
        {error ? (
          <p role="alert" className="w-full text-[14px] text-night-orchid">
            {error}
          </p>
        ) : null}
        {filled ? (
          <button type="button" disabled={saving} onClick={() => save({ gift: null, title: "", message: "" })} className={secondaryButton}>
            Empty this door
          </button>
        ) : null}
        <span className="ml-auto text-[13px] text-night-lilac" aria-live="polite">
          {valid ? "" : missing}
        </span>
        <button type="button" disabled={!valid || saving} onClick={() => save({ gift: giftChoice, title, message })} className={primaryButton}>
          {saving ? "Saving…" : "Save door"}
        </button>
      </div>
    </>
  )
}
