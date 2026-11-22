"use client"

// The calendar editor (issue #48): the sender fills every door with one of
// Majnu's ideas, their own gift, or a note. The doors light up as they fill,
// one moon step fuller each, as they will for the recipient; sharing opens once
// every door has something behind it.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Eye, Gift, PenLine, Plus, Sparkles } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { SharePanel } from "@/components/share/share-panel"
import { focusRing, primaryButton, secondaryButton, smallButton } from "@/components/app/styles"
import { calendarProgress, doorFilled, hasNote, optionForGift, shareReady } from "@/lib/calendars/doors"
import type { CalendarEditorData, DoorRequest } from "@/lib/calendars/types"
import type { GiftOption } from "@/lib/finder/events"
import { doorOpensOn } from "@/lib/letters/public-view"
import type { CalendarContent, CalendarDoor } from "@/lib/letters/schema"
import { site } from "@/lib/site"
import { findIdeas, saveDoor, writeNotes } from "./api"
import { formatDay } from "./dates"
import { DoorPicker } from "./door-picker"

type PoolState = { status: "idle" } | { status: "loading"; similarTo?: string } | { status: "error"; message: string }

function DoorTile({
  door,
  total,
  opensOn,
  option,
  onOpen,
}: {
  door: CalendarDoor
  total: number
  opensOn: string
  option: GiftOption | undefined
  onOpen: () => void
}) {
  const filled = doorFilled(door)
  const what = door.gift ? door.gift.title : hasNote(door) ? "a note" : "empty"
  const image = option?.imageUrl
  return (
    <button
      type="button"
      onClick={onOpen}
      data-door={door.day}
      aria-label={`Door ${door.day}, ${formatDay(opensOn)}: ${what}`}
      data-filled={filled || undefined}
      className={`door-tile group relative isolate flex aspect-[4/5] w-full flex-col justify-between overflow-hidden rounded-[14px] p-2 text-left sm:p-2.5 ${focusRing} ${
        filled ? "bg-night-velvet ring-1 ring-night-rose/35" : "ring-1 ring-dashed ring-night-petal/20 hover:ring-night-rose/50"
      }`}
    >
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" referrerPolicy="no-referrer" loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-70" />
          <span aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-night-plum via-night-plum/50 to-night-plum/10" />
        </>
      ) : null}
      <span aria-hidden="true" className="flex items-start justify-between">
        <span className={`font-display text-[22px] leading-none sm:text-[30px] ${filled ? "text-night-petal" : "text-night-petal/45"}`}>{door.day}</span>
        {filled ? (
          <MoonPhase lit={door.day / total} size={14} className="mt-0.5 flex-none text-night-rose" />
        ) : (
          <Plus className="mt-0.5 h-3.5 w-3.5 flex-none text-night-petal/40 transition-colors duration-200 group-hover:text-night-rose" />
        )}
      </span>
      <span aria-hidden="true" className="min-w-0">
        {door.gift ? (
          <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-night-petal sm:text-[12px]">{door.gift.title}</span>
        ) : hasNote(door) ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-night-lilac sm:text-[12px]">
            <PenLine className="h-3 w-3" /> Note
          </span>
        ) : (
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-night-petal/40">{formatDay(opensOn, "short")}</span>
        )}
      </span>
    </button>
  )
}

function IdeasCard({
  name,
  pool,
  state,
  country,
  onFind,
}: {
  name: string
  pool: GiftOption[]
  state: PoolState
  country?: string
  onFind: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const loading = state.status === "loading" && !state.similarTo
  const where = country ? ` from shops in ${regionName(country)}` : ""
  return (
    <section aria-label="Majnu's ideas" className="rounded-[22px] bg-night-velvet p-5 ring-1 ring-white/5">
      {loading ? (
        <div className="flex items-start gap-4" role="status">
          <MoonPhase lit={0.5} size={34} className="ideas-moon flex-none text-night-rose" />
          <div>
            <p className="font-display text-[22px] leading-tight">Looking for small gifts for {name}…</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-night-lilac">This takes about a minute. You can start writing notes while you wait.</p>
          </div>
        </div>
      ) : pool.length ? (
        <>
          <p className="font-display text-[22px] leading-tight">
            {pool.length} ideas for {name}
          </p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-night-lilac">Open any door to pick one{where}.</p>
          <ul aria-hidden="true" className="mt-4 flex -space-x-2">
            {pool
              .filter((o) => o.imageUrl)
              .slice(0, 6)
              .map((o) => (
                <li key={o.id} className="h-10 w-10 overflow-hidden rounded-full bg-night-plum ring-2 ring-night-velvet">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />
                </li>
              ))}
          </ul>
          {confirming ? (
            <div className="mt-4 rounded-2xl bg-night-plum/60 p-3 text-[14px] leading-relaxed">
              <p>New ideas replace these. Gifts already behind doors stay. It counts as one of today’s gift searches.</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className={smallButton}
                  onClick={() => {
                    setConfirming(false)
                    onFind()
                  }}
                >
                  Find new ideas
                </button>
                <button type="button" className={`${smallButton} ring-0`} onClick={() => setConfirming(false)}>
                  Keep these
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className={`mt-4 ${smallButton}`}>
              <Sparkles className="h-4 w-4" aria-hidden="true" /> Find new ideas
            </button>
          )}
        </>
      ) : (
        <>
          <p className="font-display text-[22px] leading-tight">Ideas for {name}</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-night-lilac">
            Majnu looks for small gifts{where} that fit your budget, with a photo, a price and a link. It counts as one of today’s gift searches.
          </p>
          <button type="button" onClick={onFind} className={`mt-4 w-full ${primaryButton}`}>
            <Sparkles className="h-4 w-4" aria-hidden="true" /> Find ideas for {name}
          </button>
        </>
      )}
      {state.status === "error" ? (
        <p role="alert" className="mt-4 rounded-2xl bg-night-plum/60 px-3 py-2.5 text-[14px] leading-relaxed text-night-petal ring-1 ring-night-orchid/40">
          {state.message}
        </p>
      ) : null}
    </section>
  )
}

function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}

export function CalendarEditor({ data, autoFind }: { data: CalendarEditorData; autoFind: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const [content, setContent] = useState<CalendarContent>(data.content)
  const [pool, setPool] = useState<GiftOption[]>(data.pool)
  const [lastDoorId, setLastDoorId] = useState<string | null>(data.lastDoorId)
  const [poolState, setPoolState] = useState<PoolState>({ status: "idle" })
  const [openDay, setOpenDay] = useState<number | null>(null)
  const [notes, setNotes] = useState<{ busy: boolean; error?: string }>({ busy: false })
  const [announcement, setAnnouncement] = useState("")
  const started = useRef(false)
  const lastOpened = useRef<number | null>(null)

  const name = content.recipientName
  const total = content.doors.length
  const progress = calendarProgress(content)
  const ready = shareReady(content)
  const emptyNotes = content.doors.filter((d) => !hasNote(d)).length
  const usedIn = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const door of content.doors) {
      if (!door.gift?.url) continue
      map.set(door.gift.url, [...(map.get(door.gift.url) ?? []), door.day])
    }
    return map
  }, [content.doors])

  const runPool = useCallback(
    async (similarTo?: string) => {
      setPoolState({ status: "loading", similarTo })
      setAnnouncement(similarTo ? "Looking for more ideas like that one." : `Looking for small gifts for ${name}.`)
      const result = await findIdeas(data.letterId, similarTo ? { similarTo } : {})
      if (!result.ok) {
        setPoolState({ status: "error", message: result.error })
        setAnnouncement(result.error)
        return
      }
      setPool(result.data.pool)
      setLastDoorId(result.data.lastDoorId)
      setPoolState({ status: "idle" })
      setAnnouncement(similarTo ? `${result.data.added} more ideas added.` : `${result.data.pool.length} ideas for ${name} are ready.`)
    },
    [data.letterId, name],
  )

  // Straight after creating the calendar, the first pool starts by itself, once.
  useEffect(() => {
    if (!autoFind || started.current) return
    started.current = true
    router.replace(pathname, { scroll: false })
    if (data.pool.length === 0) void runPool()
  }, [autoFind, data.pool.length, pathname, router, runPool])

  async function onSave(day: number, body: DoorRequest): Promise<string | null> {
    const result = await saveDoor(data.letterId, day, body)
    if (!result.ok) return result.error
    setContent((current) => ({ ...current, doors: current.doors.map((d) => (d.day === day ? result.data.door : d)) }))
    setOpenDay(null)
    const { filled, total: all } = result.data.progress
    setAnnouncement(`Door ${day} saved. ${filled} of ${all} doors filled.`)
    return null
  }

  async function onWriteNotes() {
    setNotes({ busy: true })
    setAnnouncement("Majnu is writing the notes.")
    const result = await writeNotes(data.letterId)
    if (!result.ok) {
      setNotes({ busy: false, error: result.error })
      setAnnouncement(result.error)
      return
    }
    setContent(result.data.content)
    setNotes({ busy: false })
    setAnnouncement(result.data.written ? `Majnu wrote ${result.data.written} notes.` : "Every door already has a note.")
  }

  const openDoor = content.doors.find((d) => d.day === openDay) ?? null
  const isAdvent = data.templateId === "advent-classic"
  const lastBudget = data.setup.lastDoorBudget
  const ideasCard = (
    <IdeasCard name={name} pool={pool} state={poolState} country={data.setup.country} onFind={() => void runPool()} />
  )

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 md:pt-12">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-night-lilac">
          {isAdvent ? "Advent calendar" : "Countdown"} for {name}
        </p>
        <h1 className="mt-2 text-balance font-display text-[36px] leading-[1.06] md:text-[48px]">{content.headline}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-night-lilac">
          From {formatDay(content.startDate)} to {formatDay(doorOpensOn(content.startDate, total))}, each door at midnight in{" "}
          {content.timezone.replace(/_/g, " ")}. {capitalise(data.setup.doorBudget)} a door{lastBudget ? `, ${lastBudget} behind the last` : ""}.
        </p>
      </header>

      <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-10">
        <section aria-label="Doors">
          <div className="flex items-center gap-4 rounded-[22px] bg-night-velvet/60 px-4 py-3.5">
            <MoonPhase lit={total ? progress.filled / total : 0} size={40} className="progress-moon flex-none text-night-rose" />
            <div>
              <p className="font-display text-[24px] leading-tight">
                {progress.filled} of {total} doors filled
              </p>
              <p className="text-[14px] text-night-lilac">
                {ready ? "Every door has something behind it." : `Tap a door to pick a gift or write a note. ${total - progress.filled} to go.`}
              </p>
            </div>
          </div>

          <div className="mt-4 lg:hidden">{ideasCard}</div>

          <ol className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-6 sm:gap-3">
            {content.doors.map((door) => (
              <li key={door.day}>
                <DoorTile
                  door={door}
                  total={total}
                  opensOn={doorOpensOn(content.startDate, door.day)}
                  option={optionForGift(door.gift, pool)}
                  onOpen={() => {
                    lastOpened.current = door.day
                    setOpenDay(door.day)
                  }}
                />
              </li>
            ))}
          </ol>
        </section>

        <aside aria-label="Finish the calendar" className="mt-8 grid gap-4 lg:sticky lg:top-6 lg:mt-0">
          <div className="hidden lg:block">{ideasCard}</div>

          <section aria-label="Notes" className="rounded-[22px] bg-night-velvet p-5 ring-1 ring-white/5">
            <p className="font-display text-[22px] leading-tight">The notes</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-night-lilac">
              {emptyNotes
                ? `${emptyNotes} ${emptyNotes === 1 ? "door has" : "doors have"} no note yet. Majnu can write them all at once, around each gift. Notes you wrote stay as they are.`
                : "Every door has a note."}
            </p>
            <button type="button" onClick={onWriteNotes} disabled={notes.busy || emptyNotes === 0} className={`mt-4 w-full ${secondaryButton}`}>
              <PenLine className="h-4 w-4" aria-hidden="true" />
              {notes.busy ? "Writing the notes…" : "Write the empty notes for me"}
            </button>
            {notes.error ? (
              <p role="alert" className="mt-3 text-[14px] leading-relaxed text-night-orchid">
                {notes.error}
              </p>
            ) : null}
          </section>

          <Link href={`/create/${data.letterId}/preview`} target="_blank" rel="noopener" className={`w-full ${secondaryButton}`}>
            <Eye className="h-4 w-4" aria-hidden="true" /> Preview every door
            <span className="sr-only">(opens in a new tab)</span>
          </Link>

          {ready ? (
            <SharePanel url={`${site.url}/l/${data.slug}`} />
          ) : (
            <section aria-label="Share" className="rounded-[22px] bg-night-velvet p-5 ring-1 ring-white/5">
              <div className="flex items-start gap-3">
                <Gift className="mt-1 h-5 w-5 flex-none text-night-rose" aria-hidden="true" />
                <div>
                  <p className="font-display text-[22px] leading-tight">Fill every door to send it</p>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-night-lilac">
                    {total - progress.filled} {total - progress.filled === 1 ? "door is" : "doors are"} still empty. A gift or a note in each, and the link is yours.
                  </p>
                </div>
              </div>
            </section>
          )}
        </aside>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <DoorPicker
        door={openDoor}
        opensOn={openDoor ? doorOpensOn(content.startDate, openDoor.day) : content.startDate}
        total={total}
        pool={pool}
        lastDoorId={lastDoorId}
        usedIn={usedIn}
        findingSimilar={poolState.status === "loading" ? (poolState.similarTo ?? null) : null}
        poolBusy={poolState.status === "loading"}
        onClose={() => setOpenDay(null)}
        onClosed={() => document.querySelector<HTMLElement>(`[data-door="${lastOpened.current}"]`)?.focus()}
        onSave={onSave}
        onMoreLikeThis={(id) => void runPool(id)}
        onFindIdeas={() => void runPool()}
      />

      <style>{`
        .ring-dashed { --tw-ring-shadow: none; box-shadow: none; outline: 1.5px dashed rgba(245, 234, 241, 0.22); outline-offset: -1.5px; }
        .door-tile:not([data-filled]):hover { outline-color: rgba(234, 179, 148, 0.6); }
        .door-tile:focus-visible { outline: 2px solid #EAB394; outline-offset: 2px; }
        @media (prefers-reduced-motion: no-preference) {
          .door-tile { transition: transform 250ms cubic-bezier(0.22, 0.61, 0.36, 1); }
          .door-tile:hover { transform: translateY(-2px); }
          .ideas-moon { animation: ideas-wax 3s cubic-bezier(0.22, 0.61, 0.36, 1) infinite alternate; }
        }
        @keyframes ideas-wax { from { opacity: 0.45; } to { opacity: 1; } }
      `}</style>
    </div>
  )
}

function capitalise(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}
