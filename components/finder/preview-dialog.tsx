"use client"

import { useLayoutEffect, useRef, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ArrowUpRight, X } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { focusRing, quietLink } from "./styles"
import { useVisualViewportVars } from "./visual-viewport"

type Props = {
  // The page to show: a demo gift on the landing page, or the owner preview
  // of a gift just wrapped. Null keeps the dialog closed.
  src: string | null
  title: string
  onClose: () => void
}

// A gift page shown over the current page, so looking at a design never
// navigates away: a full-height sheet on phones, a large panel from md up.
// Escape, the close button and a click outside close it, and focus goes back
// to whatever opened it. Opening the page in its own tab stays one tap away.
export function PreviewDialog({ src, title, onClose }: Props) {
  const open = src !== null
  // The last page shown stays in the frame while the dialog closes.
  const [shown, setShown] = useState<string | null>(src)
  if (src !== null && src !== shown) setShown(src)

  // Radix returns focus only to a Dialog.Trigger; these dialogs open from
  // ordinary links and buttons, so the opener is recorded here.
  const opener = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      opener.current = document.activeElement
    }
  }, [open])
  useVisualViewportVars(open)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-x-0 top-[var(--vv-top,0px)] z-[60] flex h-[var(--vv-height,100dvh)] flex-col bg-night-deep/80 pt-2 backdrop-blur-sm motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 md:inset-0 md:h-auto md:items-center md:justify-center md:p-6">
          <DialogPrimitive.Content
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              if (opener.current?.isConnected) opener.current.focus()
            }}
            className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-t-[22px] bg-night-plum text-night-petal outline-none motion-safe:duration-300 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:slide-in-from-bottom-4 md:h-[min(900px,calc(100dvh-48px))] md:w-[min(1120px,calc(100vw-48px))] md:flex-none md:rounded-[24px] md:shadow-2xl md:shadow-black/40 md:ring-1 md:ring-inset md:ring-night-petal/10"
          >
            <header className="flex shrink-0 items-center gap-3 border-b border-night-petal/10 py-1.5 pl-4 pr-1.5 sm:pl-5">
              <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</DialogPrimitive.Title>
              {shown && (
                <a href={shown} target="_blank" rel="noopener" className={`hidden items-center gap-1 text-sm sm:inline-flex ${quietLink}`}>
                  Open in a new tab
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
              <DialogPrimitive.Close
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-night-lilac transition-colors duration-200 hover:bg-night-petal/10 hover:text-night-petal ${focusRing}`}
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </DialogPrimitive.Close>
            </header>
            <DialogPrimitive.Description className="sr-only">The page as they will see it when they open your link.</DialogPrimitive.Description>
            {shown && <Frame key={shown} src={shown} title={title} />}
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// The page in a frame, with a quiet moon until it has loaded.
function Frame({ src, title }: { src: string; title: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="relative min-h-0 flex-1 bg-night-deep">
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-night-lilac" aria-hidden="true">
          <MoonPhase lit={0.5} size={28} className="text-night-rose motion-safe:animate-[moon-breathe_2.4s_ease-in-out_infinite]" />
          <span className="text-sm">Opening the page…</span>
        </div>
      )}
      <iframe
        src={src}
        title={title}
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 h-full w-full transition-opacity duration-500 ease-calm ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  )
}
