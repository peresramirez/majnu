"use client"

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ArrowUp, X } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { contextChips } from "./context-chips"
import { Conversation } from "./conversation"
import { statusLit, type FinderItem } from "./finder-state"
import { focusRing } from "./styles"
import type { Finder } from "./use-finder"
import { WrapFooter, WrapView } from "./wrap-view"

type Props = {
  finder: Finder
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MAX_COMPOSER_HEIGHT = 140

// What a screen reader hears when a reply finishes.
function announcement(items: FinderItem[]): string {
  const last = items[items.length - 1]
  if (!last) return ""
  if (last.role === "options") return `${last.options.length} gift ideas are ready.`
  if (last.role === "question") return `Majnu asks: ${last.text}`
  if (last.role === "notice") return last.message
  if (last.role === "assistant") return "Majnu replied."
  return ""
}

// The gift finder: a full-height sheet on phones and a large panel from md up.
// Escape, the close button and a click outside close it (Radix Dialog), and
// focus goes back to whatever opened it.
export function FinderDialog({ finder, open, onOpenChange }: Props) {
  const { state, wrap, send, choose, chooseTemplate, wrapGift, backToIdeas, checkHostRef, transport } = finder
  const [draft, setDraft] = useState("")
  const composer = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const seen = useRef<string | null>(null)
  // Whatever opened the finder (the hero's button, field or a suggestion). Radix
  // only returns focus to a Dialog.Trigger, and the finder has none, so it is
  // recorded here before the dialog takes focus and given back on close.
  const opener = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      opener.current = document.activeElement
    }
  }, [open])
  const chips = contextChips(state.context)
  const wrapping = wrap.stage !== "closed"

  // Grow the message box with its text, up to a few lines.
  useLayoutEffect(() => {
    const el = composer.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`
  }, [draft, open, wrapping])

  // Follow the conversation: new gift ideas scroll to their top (so all three
  // can be read from the first), anything else to the bottom while the reader
  // is already near it.
  const lastItem = state.items[state.items.length - 1]
  const lastText = lastItem?.role === "assistant" ? lastItem.text.length : 0
  useEffect(() => {
    const el = scroller.current
    if (!el || wrapping || !lastItem) return
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const isNew = seen.current !== lastItem.id
    seen.current = lastItem.id
    if (isNew && lastItem.role === "options") {
      // Scroll only the conversation: scrollIntoView would also move the panel.
      const blocks = el.querySelectorAll<HTMLElement>("[data-options]")
      const block = blocks[blocks.length - 1]
      if (block) {
        const top = block.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 16
        el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" })
      }
      return
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (nearBottom || (isNew && lastItem.role === "user")) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" })
  }, [lastItem, lastText, wrapping])

  // Opening the wrap step, and the finished gift, put focus on the new heading.
  // A failed wrap goes back to the form without moving focus, so the error and
  // the button stay where the visitor is.
  const previousStage = useRef(wrap.stage)
  useEffect(() => {
    const from = previousStage.current
    previousStage.current = wrap.stage
    if (!open) return
    const entered = (wrap.stage === "choose" && from === "closed") || (wrap.stage === "ready" && from !== "ready")
    if (!entered) return
    scroller.current?.scrollTo({ top: 0 })
    content.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true })
  }, [wrap.stage, open])

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (send(draft)) setDraft("")
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  function prefill(text: string) {
    setDraft(text)
    requestAnimationFrame(() => {
      const el = composer.current
      if (!el) return
      el.focus()
      el.setSelectionRange(text.length, text.length)
    })
  }

  const lit = statusLit(state)
  const statusText = state.status ?? (state.streaming ? "Majnu is writing…" : null)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 grid grid-cols-[minmax(0,1fr)] bg-night-deep/80 backdrop-blur-sm motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 md:place-items-center md:p-6">
          <DialogPrimitive.Content
            ref={content}
            // Focus the panel itself on open: no phone keyboard pops up, and
            // the next Tab reaches the first control.
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              content.current?.focus()
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              const target = opener.current?.isConnected ? opener.current : document.getElementById("finder-hero-message")
              target?.focus()
            }}
            className="relative flex h-[100dvh] w-full min-w-0 flex-col overflow-clip bg-night-plum text-night-petal outline-none motion-safe:duration-300 motion-safe:ease-calm motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:slide-in-from-bottom-6 md:h-[min(880px,calc(100dvh-48px))] md:max-w-[1000px] md:rounded-[28px] md:shadow-2xl md:shadow-black/40 md:ring-1 md:ring-inset md:ring-night-petal/10"
          >
            <header className="shrink-0 border-b border-night-petal/10">
              <div className="mx-auto flex max-w-[920px] items-center gap-3 py-3 pl-4 pr-2 sm:pl-6 sm:pr-4">
              <MoonPhase lit={lit} size={30} className="shrink-0 text-night-rose" />
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="text-[15px] font-semibold leading-tight">Majnu</DialogPrimitive.Title>
                <p className="truncate text-[13px] leading-snug text-night-lilac" role="status" aria-live="polite">
                  {statusText ?? (wrap.stage === "ready" ? "Your gift is wrapped" : wrapping ? "Wrapping your gift" : "Finding a gift with you")}
                </p>
              </div>
              <DialogPrimitive.Close
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-night-lilac transition-colors hover:bg-night-petal/10 hover:text-night-petal ${focusRing}`}
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </DialogPrimitive.Close>
              </div>
            </header>
            <DialogPrimitive.Description className="sr-only">
              Majnu suggests three gifts for the person you describe, and wraps the one you choose in a page you can send.
            </DialogPrimitive.Description>

            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div
                className={`mx-auto w-full max-w-[920px] px-4 pt-4 sm:px-6 sm:pt-5 ${
                  wrap.stage === "ready" ? "pb-8 md:flex md:h-full md:flex-col md:pb-6" : wrapping ? "pb-4" : "pb-8"
                }`}
              >
                {chips.length > 0 && !wrapping && (
                  <div className="mb-5">
                    <p className="text-xs font-medium text-night-lilac">Majnu assumed this. Tap one to change it.</p>
                    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="What Majnu assumed">
                      {chips.map((c) => (
                        <li key={c.key}>
                          <button
                            type="button"
                            onClick={() => prefill(c.prefill)}
                            aria-label={c.description}
                            className={`rounded-full bg-night-velvet px-3 py-1.5 text-[13px] font-medium text-night-petal ring-1 ring-inset ring-night-petal/10 transition-colors duration-200 hover:ring-night-petal/35 ${focusRing}`}
                          >
                            {c.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Turnstile renders here, and only shows itself if Cloudflare needs an interaction. */}
                <div ref={checkHostRef} className="flex justify-center empty:hidden [&:not(:empty)]:mb-4" />

                {wrapping ? (
                  <WrapView
                    key={wrap.option.id}
                    wrap={wrap}
                    onTemplate={chooseTemplate}
                    onWrap={wrapGift}
                    onBack={backToIdeas}
                    previewUrl={transport.previewUrl}
                    shareUrl={transport.shareUrl}
                  />
                ) : (
                  <Conversation state={state} onSend={(text) => void send(text)} onChoose={choose} />
                )}
              </div>
            </div>

            {(wrap.stage === "choose" || wrap.stage === "wrapping") && <WrapFooter wrap={wrap} />}

            {!wrapping && (
              <form onSubmit={submit} className="shrink-0 border-t border-night-petal/10 bg-night-plum pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
                {/* Same width and padding as the conversation, so the edges line up. */}
                <div className="mx-auto max-w-[920px] px-4 sm:px-6">
                <div className="flex items-end gap-2 rounded-[24px] bg-night-velvet py-1.5 pl-4 pr-1.5 ring-1 ring-inset ring-night-petal/15 focus-within:ring-night-rose/60">
                  <label htmlFor="finder-message" className="sr-only">
                    Message to Majnu
                  </label>
                  <textarea
                    id="finder-message"
                    ref={composer}
                    rows={1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                    enterKeyHint="send"
                    maxLength={1000}
                    placeholder="Tell Majnu more about them"
                    className="max-h-[140px] min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[16px] leading-6 text-night-petal placeholder:text-night-lilac/70 focus:outline-none"
                  />
                  <button
                    type="submit"
                    aria-label="Send"
                    aria-disabled={state.streaming || !draft.trim()}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-night-rose text-night-plum transition-opacity duration-200 hover:bg-[#F1C4A9] aria-disabled:opacity-50 ${focusRing}`}
                  >
                    <ArrowUp className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                </div>
              </form>
            )}

            <p className="sr-only" aria-live="polite">
              {state.streaming ? "" : announcement(state.items)}
            </p>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
