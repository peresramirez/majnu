"use client"

// A button that opens a vertical video in a modal dialog (the short pitch's
// app demo). The dialog is in the browser's top layer, so the slide's
// overflow and transforms do not clip it. Clicks inside it stop at the dialog,
// so the deck does not turn the slide; Escape or the close button closes it
// and stops the video.
import { useEffect, useRef } from "react"
import { Play, X } from "lucide-react"

type Props = { src: string; poster: string; label: string; length: string; closeLabel: string; wide?: boolean; asLink?: boolean }

export function VideoPopup({ src, poster, label, length, closeLabel, wide = false, asLink = false }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const video = useRef<HTMLVideoElement>(null)

  // Escape closes the dialog natively; the video stops with it.
  useEffect(() => {
    const element = dialog.current
    const stop = () => video.current?.pause()
    element?.addEventListener("close", stop)
    return () => element?.removeEventListener("close", stop)
  }, [])

  function open() {
    dialog.current?.showModal()
    void video.current?.play().catch(() => undefined)
  }

  function close() {
    video.current?.pause()
    dialog.current?.close()
  }

  return (
    <>
      {asLink ? (
        <button type="button" className="sp-card-link sp-card-play" onClick={open}>
          ▶ {label} ({length})
        </button>
      ) : (
      <button type="button" className="sp-watch" onClick={open}>
        <span className="sp-watch-icon" aria-hidden="true">
          <Play fill="currentColor" strokeWidth={0} />
        </span>
        <span>
          {label} <span className="sp-watch-length">{length}</span>
        </span>
      </button>
      )}
      <dialog
        ref={dialog}
        className="sp-dialog"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation()
          if (e.target === dialog.current) close()
        }}
      >
        <video ref={video} className={`sp-video ${wide ? "sp-video--wide" : ""}`} src={src} poster={poster} controls muted playsInline preload="none" />
        <button type="button" className="sp-close" onClick={close} aria-label={closeLabel}>
          <X aria-hidden="true" />
        </button>
      </dialog>
    </>
  )
}
