"use client"

// The pitch deck's controller: which slide shows, and how a presenter moves
// through them (keys, clicks and taps, swipes, the address's hash, fullscreen,
// the presenter view with speaker notes). It holds no words of its own: the
// slides arrive already rendered from the server (slides.tsx), and even the
// controls' labels come with them, only after the password gate. This file's
// bundle loads with the password screen, so it must not hint at a deck.
//
// Layout is CSS (app/(pitch)/pitch/deck.css): slides letterboxed at 16:9 on
// screens, a scrolling column on a phone held upright, one slide per page in
// print.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Maximize, Minimize, NotebookText } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import {
  clickAction,
  formatClock,
  hashForSlide,
  keyAction,
  slideFromHash,
  swipeAction,
  type DeckAction,
} from "@/lib/pitch/navigation"

// The controls' words, given by the server with the slides.
export type DeckLabels = {
  hint: string
  controls: string
  slide: string
  of: string
  notes: string
  notesKey: string
  fullscreen: string
  leaveFullscreen: string
  time: string
  restartClock: string
  next: string
  last: string
  appendix: string
}

export type DeckSlide = {
  id: string
  label: string
  notes: string
  content: ReactNode
  // After the final slide, for questions: past the counter's total.
  appendix?: boolean
}

// Must match the column layout's media query in deck.css.
const COLUMN_QUERY = "(orientation: portrait) and (max-width: 900px)"
// The counter, marks and buttons fade out after this long without the pointer moving.
const IDLE_MS = 2500

function inColumn(): boolean {
  return window.matchMedia(COLUMN_QUERY).matches
}

export function Deck({ slides, labels: t }: { slides: DeckSlide[]; labels: DeckLabels }) {
  const count = slides.length
  const mainCount = slides.filter((s) => !s.appendix).length
  const [index, setIndex] = useState(0)
  const [ready, setReady] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [idle, setIdle] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [canFullscreen, setCanFullscreen] = useState(false)
  const [clockStart, setClockStart] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const swipedAt = useRef(0)

  const go = useCallback((next: number) => setIndex(Math.min(Math.max(next, 0), count - 1)), [count])

  const run = useCallback(
    (action: DeckAction) => {
      switch (action) {
        case "next":
          return setIndex((i) => Math.min(i + 1, count - 1))
        case "prev":
          return setIndex((i) => Math.max(i - 1, 0))
        case "first":
          return go(0)
        case "last":
          return go(mainCount - 1)
        case "notes":
          return setNotesOpen((open) => !open)
        case "fullscreen":
          if (document.fullscreenElement) void document.exitFullscreen()
          else void document.documentElement.requestFullscreen?.().catch(() => undefined)
          return
      }
    },
    [count, mainCount, go],
  )

  // Open the slide the address names (#5) before the first frame is shown, so
  // the deck never flashes slide one on its way there.
  useLayoutEffect(() => {
    const fromHash = slideFromHash(window.location.hash, count)
    if (fromHash !== null) {
      setIndex(fromHash)
      // Instant: the site scrolls smoothly, which a page still loading cuts short.
      if (inColumn()) document.getElementById(`slide-${fromHash + 1}`)?.scrollIntoView({ behavior: "instant" })
    }
    setCanFullscreen(Boolean(document.fullscreenEnabled))
    setReady(true)
  }, [count])

  // The address follows the slide, without adding to the history. Passing no
  // state lets Next.js's own replaceState record the new address: given its
  // internal state, it would skip that, and the next update of its router
  // would put the old address back.
  useEffect(() => {
    if (!ready || inColumn()) return
    const hash = hashForSlide(index)
    if (window.location.hash !== hash) window.history.replaceState(null, "", hash)
  }, [index, ready])

  useEffect(() => {
    const onHash = () => {
      const fromHash = slideFromHash(window.location.hash, count)
      if (fromHash === null) return
      setIndex(fromHash)
      // A hash typed in the address bar bypasses Next.js's router; tell it,
      // as above, so it never puts an older address back.
      window.history.replaceState(null, "", window.location.hash)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [count])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      const target = e.target instanceof HTMLElement ? e.target : null
      if (target?.closest("input, textarea, select, [contenteditable]")) return
      // Space and Enter on a focused button, link or video press it, nothing more.
      if (target?.closest("button, a, video") && (e.key === " " || e.key === "Enter")) return
      if (inColumn()) return
      const action = keyAction(e.key, e.shiftKey)
      if (!action) return
      e.preventDefault()
      run(action)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [run])

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  // Controls fade out while the presenter talks and come back with the pointer.
  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), IDLE_MS)
    const wake = () => {
      setIdle(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), IDLE_MS)
    }
    window.addEventListener("pointermove", wake)
    window.addEventListener("focusin", wake)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("pointermove", wake)
      window.removeEventListener("focusin", wake)
    }
  }, [])

  // The presenter's clock starts when the notes are first opened.
  useEffect(() => {
    if (!notesOpen) return
    setClockStart((start) => start ?? Date.now())
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [notesOpen])

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (inColumn() || Date.now() - swipedAt.current < 500) return
    if (e.target instanceof Element && e.target.closest("a, button, video")) return
    const rect = e.currentTarget.getBoundingClientRect()
    run(clickAction(e.clientX - rect.left, rect.width))
  }

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0]
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null
  }

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current
    const t = e.changedTouches[0]
    touchStart.current = null
    if (!start || !t || inColumn()) return
    const action = swipeAction(t.clientX - start.x, t.clientY - start.y)
    if (!action) return
    swipedAt.current = Date.now()
    run(action)
  }

  const slide = slides[index]
  const next = slides[index + 1]
  const position = slide?.appendix ? t.appendix : `${index + 1} / ${mainCount}`

  return (
    <div
      className="pd-root"
      data-ready={ready ? "" : undefined}
      data-notes={notesOpen ? "" : undefined}
      data-idle={idle ? "" : undefined}
    >
      <p className="pd-hint">{t.hint}</p>

      <div className="pd-stage" onClick={onStageClick} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="pd-frame">
          {slides.map((s, i) => (
            <section
              key={s.id}
              id={`slide-${i + 1}`}
              className="pd-slide"
              data-active={i === index ? "" : undefined}
              aria-roledescription="slide"
              aria-label={s.appendix ? s.label : `${i + 1} ${t.of} ${mainCount}: ${s.label}`}
            >
              {s.content}
            </section>
          ))}
        </div>
      </div>

      <nav className="pd-controls" aria-label={t.controls}>
        <ol className="pd-marks">
          {slides.map((s, i) => (
            <li key={s.id} className={s.appendix ? "pd-mark-item pd-mark-item--appendix" : "pd-mark-item"}>
              <button
                type="button"
                className="pd-mark"
                aria-label={s.appendix ? s.label : `${t.slide} ${i + 1}: ${s.label}`}
                aria-current={i === index ? "step" : undefined}
                onClick={() => go(i)}
              >
                {i === index ? <MoonPhase lit={s.appendix ? 1 : (i + 1) / mainCount} size={16} /> : <span className="pd-dot" />}
              </button>
            </li>
          ))}
        </ol>
        <span className="pd-counter">{position}</span>
        <button
          type="button"
          className="pd-btn"
          aria-pressed={notesOpen}
          aria-label={t.notesKey}
          title={t.notesKey}
          onClick={() => run("notes")}
        >
          <NotebookText aria-hidden="true" strokeWidth={1.5} />
        </button>
        {canFullscreen && (
          <button
            type="button"
            className="pd-btn"
            aria-label={fullscreen ? t.leaveFullscreen : t.fullscreen}
            title={fullscreen ? t.leaveFullscreen : t.fullscreen}
            onClick={() => run("fullscreen")}
          >
            {fullscreen ? <Minimize aria-hidden="true" strokeWidth={1.5} /> : <Maximize aria-hidden="true" strokeWidth={1.5} />}
          </button>
        )}
      </nav>

      {notesOpen && slide && (
        <aside className="pd-notes" aria-label={t.notes}>
          <div className="pd-notes-text">
            <p className="pd-notes-meta">
              {position} · {slide.label}
            </p>
            <p>{slide.notes}</p>
          </div>
          <div className="pd-notes-side">
            <button
              type="button"
              className="pd-clock"
              onClick={() => {
                setClockStart(Date.now())
                setNow(Date.now())
              }}
              aria-label={`${t.time} ${formatClock(clockStart ? now - clockStart : 0)}. ${t.restartClock}`}
              title={t.restartClock}
            >
              {formatClock(clockStart ? now - clockStart : 0)}
            </button>
            <p className="pd-notes-next">{next ? `${t.next}: ${next.label}` : t.last}</p>
          </div>
        </aside>
      )}

      <p className="pd-sr" aria-live="polite">
        {ready && slide ? `${position}: ${slide.label}` : ""}
      </p>
    </div>
  )
}
