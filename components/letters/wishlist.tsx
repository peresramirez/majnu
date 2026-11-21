"use client"

// The gift list at the end of a wedding or party invitation (issue #35).
// A guest taps "I'll bring this", may leave a first name for the host, and the
// gift shows as taken for everyone else. Which gifts are taken comes from the
// server: from the page render when the invitation got it there, otherwise from
// GET /api/claim once the page has loaded. Nothing is stored on the guest's
// device; "you're bringing this" lasts only as long as the page is open.
// No images and no third-party requests: the shop link is a plain link.
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react"
import type { WishlistItem } from "@/lib/letters/schema"
import { focusRing, paperStyle } from "./chrome"
import { useLetter } from "./letter-context"
import { claimedFrom, claimOutcome, giftListView, type GiftListRow } from "./wishlist-model"

type Mood = "elegant" | "playful"

const MAX_NAME = 40

type Notice = { itemId: string; text: string }

export function Wishlist({
  items,
  claimed,
  mood,
  hostName,
}: {
  items: WishlistItem[]
  // The ids claimed when the page rendered. Undefined: not known yet, so the
  // list asks the server after loading and waits before anyone can claim.
  claimed?: string[]
  mood: Mood
  hostName: string
}) {
  const { slug, ownerPreview } = useLetter()
  const [taken, setTaken] = useState<Set<string> | null>(() => (claimed ? new Set(claimed) : null))
  const [mine, setMine] = useState<Set<string>>(() => new Set())
  const [gone, setGone] = useState<Set<string>>(() => new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const known = claimed !== undefined

  useEffect(() => {
    if (known || !slug) return
    let cancelled = false
    fetch(`/api/claim?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (!cancelled) setTaken(new Set(claimedFrom(body)))
      })
      // If the list cannot be read, claiming still works: the server refuses a taken gift.
      .catch(() => !cancelled && setTaken(new Set()))
    return () => {
      cancelled = true
    }
  }, [known, slug])

  if (!items.length) return null

  async function claim(itemId: string, name: string) {
    setPendingId(itemId)
    setNotice(null)
    try {
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, itemId, ...(name.trim() ? { name: name.trim() } : {}) }),
      })
      const outcome = claimOutcome(res.status, await res.json().catch(() => null), hostName)
      if (outcome.claimed) setTaken(new Set(outcome.claimed))
      if (outcome.mine) setMine((prev) => new Set(prev).add(itemId))
      if (outcome.gone) setGone((prev) => new Set(prev).add(itemId))
      if (outcome.closeForm) setOpenId(null)
      setNotice({ itemId, text: outcome.message })
    } catch {
      setNotice({ itemId, text: "That did not work. Check your connection and try again." })
    } finally {
      setPendingId(null)
    }
  }

  const elegant = mood === "elegant"
  const view = giftListView({ items, taken, mine, gone, ownerPreview })

  return (
    <section aria-labelledby="gift-list-title" className="mx-auto mt-14 w-full max-w-[460px]">
      <p className="text-center text-[12px] font-semibold uppercase tracking-[0.28em] text-[var(--page-muted)]">Gift list</p>
      <h2
        id="gift-list-title"
        className={`mt-3 text-balance text-center ${elegant ? "text-[30px] leading-[1.1]" : "text-[34px] leading-[1] tracking-[-0.02em]"}`}
        style={elegant ? { fontFamily: "var(--formal)", fontWeight: 500 } : { fontFamily: "var(--display)", fontWeight: 700 }}
      >
        {elegant ? "If you would like to bring something" : "Want to bring something?"}
      </h2>
      <p className="mx-auto mt-3 max-w-[34ch] text-center text-[15px] leading-relaxed text-[var(--page-muted)]">{view.intro}</p>
      {view.summary ? <p className="mt-2 text-center text-[13px] text-[var(--page-muted)]">{view.summary}</p> : null}

      <ul className={`mt-7 ${elegant ? "space-y-3" : "space-y-4"}`}>
        {view.rows.map((row) => (
          <WishlistRow
            key={row.item.id}
            row={row}
            mood={mood}
            hostName={hostName}
            open={openId === row.item.id}
            pending={pendingId === row.item.id}
            notice={notice?.itemId === row.item.id ? notice.text : null}
            onOpen={() => {
              setNotice(null)
              setOpenId(row.item.id)
            }}
            onCancel={() => setOpenId(null)}
            onClaim={(name) => claim(row.item.id, name)}
          />
        ))}
      </ul>
    </section>
  )
}

function WishlistRow({
  row,
  mood,
  hostName,
  open,
  pending,
  notice,
  onOpen,
  onCancel,
  onClaim,
}: {
  row: GiftListRow
  mood: Mood
  hostName: string
  open: boolean
  pending: boolean
  notice: string | null
  onOpen: () => void
  onCancel: () => void
  onClaim: (name: string) => void
}) {
  const { item, state, url } = row
  const elegant = mood === "elegant"
  const unavailable = state === "taken" || state === "gone"
  const card: CSSProperties = { ...paperStyle, boxShadow: elegant ? "0 18px 40px -30px rgba(0,0,0,0.6)" : "0 22px 44px -28px rgba(0,0,0,0.55)" }

  return (
    <li
      className={`${elegant ? "rounded-[4px]" : "rounded-[22px]"} px-5 py-5 ${unavailable ? "opacity-70" : ""}`}
      style={card}
      data-gift-state={state}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3
            className={`text-[19px] leading-snug ${state === "taken" ? "line-through decoration-1" : ""}`}
            style={elegant ? { fontFamily: "var(--formal)", fontWeight: 500 } : { fontFamily: "var(--display)", fontWeight: 700 }}
          >
            {item.title}
          </h3>
          {item.description ? <p className="mt-1 text-[15px] leading-relaxed text-[var(--paper-muted)]">{item.description}</p> : null}
        </div>
        {item.price ? <p className="shrink-0 pt-0.5 text-[15px] font-semibold tabular-nums">{item.price}</p> : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        {state === "open" && !open ? (
          <button
            type="button"
            onClick={onOpen}
            disabled={!row.canClaim}
            className={`${claimButton(mood)} ${focusRing} disabled:cursor-not-allowed disabled:opacity-50`}
            style={claimButtonStyle(mood)}
          >
            I&apos;ll bring this
          </button>
        ) : null}
        {state === "taken" ? <StatusPill mood={mood}>Taken</StatusPill> : null}
        {state === "gone" ? <StatusPill mood={mood}>No longer on the list</StatusPill> : null}
        {state === "mine" ? <StatusPill mood={mood}>You&apos;re bringing this</StatusPill> : null}
        {url && !open ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className={`rounded-sm text-[14px] font-medium text-[var(--paper-accent)] underline decoration-1 underline-offset-4 ${focusRing}`}
          >
            See it in the shop<span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </div>

      {state === "open" && open ? <ClaimForm mood={mood} hostName={hostName} pending={pending} onCancel={onCancel} onClaim={onClaim} /> : null}

      <p aria-live="polite" className={notice ? "mt-3 text-[14px] leading-relaxed text-[var(--paper-ink)]" : "sr-only"}>
        {notice ?? ""}
      </p>
    </li>
  )
}

function ClaimForm({
  mood,
  hostName,
  pending,
  onCancel,
  onClaim,
}: {
  mood: Mood
  hostName: string
  pending: boolean
  onCancel: () => void
  onClaim: (name: string) => void
}) {
  const inputId = useId()
  const hintId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [name, setName] = useState("")

  useEffect(() => input.current?.focus(), [])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!pending) onClaim(name)
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel()
      }}
      className="mt-4 border-t border-[var(--line)] pt-4"
    >
      <label htmlFor={inputId} className="block text-[14px] font-semibold">
        Your first name <span className="font-normal text-[var(--paper-muted)]">(optional)</span>
      </label>
      <input
        ref={input}
        id={inputId}
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={MAX_NAME}
        autoComplete="given-name"
        aria-describedby={hintId}
        className={`mt-2 w-full rounded-xl border border-[var(--line)] bg-transparent px-3.5 py-3 text-[16px] text-[var(--paper-ink)] placeholder:text-[var(--paper-muted)] ${focusRing}`}
        placeholder="e.g. Sam"
      />
      <p id={hintId} className="mt-1.5 text-[13px] text-[var(--paper-muted)]">
        Only {hostName} sees it.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={`${claimButton(mood)} ${focusRing} disabled:cursor-wait disabled:opacity-60`}
          style={claimButtonStyle(mood)}
        >
          {pending ? "Saving…" : "Yes, I'll bring it"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`rounded-full px-3 py-2 text-[14px] font-medium text-[var(--paper-muted)] hover:text-[var(--paper-ink)] ${focusRing}`}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function claimButton(mood: Mood): string {
  return mood === "elegant"
    ? "inline-flex items-center justify-center rounded-full border px-5 py-3 text-[13px] font-semibold uppercase tracking-[0.16em] transition-colors duration-200"
    : "inline-flex items-center justify-center rounded-full px-5 py-3 text-[15px] font-semibold transition-transform duration-200 ease-calm hover:-translate-y-0.5 disabled:hover:translate-y-0"
}

function claimButtonStyle(mood: Mood): CSSProperties {
  return mood === "elegant"
    ? { borderColor: "color-mix(in srgb, var(--paper-ink) 40%, transparent)", color: "var(--paper-ink)" }
    : { background: "var(--accent)", color: "var(--accent-ink)" }
}

function StatusPill({ mood, children }: { mood: Mood; children: ReactNode }) {
  return (
    <span
      className={
        mood === "elegant"
          ? "inline-flex items-center rounded-full border border-[var(--line)] px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--paper-muted)]"
          : "inline-flex items-center rounded-full px-3.5 py-1.5 text-[13px] font-bold uppercase tracking-[0.12em]"
      }
      style={mood === "elegant" ? undefined : { background: "var(--page-ink)", color: "var(--page-flat)" }}
    >
      {children}
    </span>
  )
}
