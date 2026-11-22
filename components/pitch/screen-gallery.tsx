"use client"

// "See every screen" on the short pitch's Product slide: a modal gallery of
// the app's main views (developer's screenshots, 22 November). Arrow keys and
// the arrows move between screens, the thumbnails jump, Escape closes. Clicks
// and keys stay inside the dialog so the deck does not turn the slide.
import { useRef, useState } from "react"
import { ChevronLeft, ChevronRight, LayoutGrid, X } from "lucide-react"

export type Screen = { src: string; title: string; caption: string; tall?: boolean }

type Props = { screens: Screen[]; label: string; closeLabel: string }

export function ScreenGallery({ screens, label, closeLabel }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [index, setIndex] = useState(0)
  const count = screens.length
  const go = (next: number) => setIndex(((next % count) + count) % count)
  const screen = screens[index]

  return (
    <>
      <button
        type="button"
        className="sp-watch sp-watch--quiet"
        onClick={() => {
          setIndex(0)
          dialog.current?.showModal()
        }}
      >
        <span className="sp-watch-icon" aria-hidden="true">
          <LayoutGrid />
        </span>
        <span>
          {label} <span className="sp-watch-length">{count}</span>
        </span>
      </button>
      <dialog
        ref={dialog}
        className="sp-dialog sp-gallery"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation()
          if (e.target === dialog.current) dialog.current?.close()
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault()
            e.stopPropagation()
            go(index + (e.key === "ArrowRight" ? 1 : -1))
          }
        }}
      >
        <div className="sp-gallery-stage">
          <button type="button" className="sp-gallery-arrow" onClick={() => go(index - 1)} aria-label="Previous screen">
            <ChevronLeft aria-hidden="true" />
          </button>
          <figure className={`sp-gallery-figure ${screen.tall ? "sp-gallery-figure--tall" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={screen.src} alt={`${screen.title}: ${screen.caption}`} />
            <figcaption>
              <strong>{screen.title}</strong> {screen.caption}
              <span className="sp-gallery-count">
                {index + 1} / {count}
              </span>
            </figcaption>
          </figure>
          <button type="button" className="sp-gallery-arrow" onClick={() => go(index + 1)} aria-label="Next screen">
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <ul className="sp-gallery-thumbs">
          {screens.map((s, i) => (
            <li key={s.src}>
              <button type="button" aria-label={s.title} aria-current={i === index || undefined} onClick={() => setIndex(i)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.src} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="sp-close" onClick={() => dialog.current?.close()} aria-label={closeLabel}>
          <X aria-hidden="true" />
        </button>
      </dialog>
    </>
  )
}
