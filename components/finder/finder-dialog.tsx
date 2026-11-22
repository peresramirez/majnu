"use client"

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ArrowUp, X } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { VoiceButton } from "@/components/voice/voice-button"
import { contextChips } from "./context-chips"
import { Conversation, MORE_PLACEHOLDER } from "./conversation"
import { AttachButton, AttachmentTray, DropOverlay } from "./attachment-tray"
import { filesFromClipboard } from "./attachments"
import { ANSWER_PLACEHOLDER, filesSent, finderAnnouncement, hasAnswers, openQuestions, statusLit } from "./finder-state"
import { focusRing } from "./styles"
import { useAttachments, useFileDrop } from "./use-attachments"
import type { Finder } from "./use-finder"
import { useVisualViewportVars } from "./visual-viewport"
import { WRAP_PLACEHOLDER, WrapFooter, WrapView } from "./wrap-view"

type Props = {
  finder: Finder
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Four lines, then the box scrolls: 4 × 24px + 16px padding.
const MAX_COMPOSER_HEIGHT = 112

// The gift finder: a bottom sheet as tall as the visible screen on phones (it
// follows the keyboard, so the message box stays in view), and from md up a
// panel of reading width near the top of the screen that is only as tall as
// what it holds. Escape, the close button and a click outside close it (Radix
// Dialog), and focus goes back to whatever opened it.
export function FinderDialog({ finder, open, onOpenChange }: Props) {
  const { state, wrap, send, choose, checkHostRef, transport } = finder
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
  useVisualViewportVars(open)
  const chips = contextChips(state.context)
  const wrapping = wrap.stage !== "closed"
  const ready = wrap.stage === "ready"
  // The message box stays while the visitor chooses a design and fills in the
  // page: what they type there goes to Majnu with their choice (issue #70).
  const composing = wrap.stage === "closed" || wrap.stage === "choose"
  // Majnu's questions are waiting for answers (issue #82).
  const answering = !wrapping && openQuestions(state.items).length > 0
  // Photos and documents waiting to go with the next message (issue #77).
  const attachments = useAttachments(filesSent(state.items))
  const drop = useFileDrop((files) => void attachments.add(files), composing)
  const sendable = (draft.trim() !== "" || hasAnswers(state) || attachments.items.length > 0) && !attachments.preparing

  // Grow the message box with its text, up to a few lines.
  useLayoutEffect(() => {
    const el = composer.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`
  }, [draft, open, wrapping])

  // Follow the conversation: new gift ideas scroll to their top (so all six
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

  // Sends what is typed, with the answers picked for Majnu's open questions
  // (issue #82): Enter, the send button and "Send answers" all come here.
  function submit(e?: FormEvent) {
    e?.preventDefault()
    // A photo still being made smaller goes with the message, so wait for it.
    if (attachments.preparing) return
    if (send(draft, { answers: true, files: attachments.items })) {
      setDraft("")
      attachments.clear()
    }
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
        <DialogPrimitive.Overlay className="fixed inset-x-0 top-[var(--vv-top,0px)] z-50 flex h-[var(--vv-height,100dvh)] flex-col bg-night-deep/75 pt-2 backdrop-blur-sm motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 md:inset-0 md:h-auto md:items-center md:px-6 md:pb-6 md:pt-[max(24px,8vh)]">
          <DialogPrimitive.Content
            ref={content}
            {...drop.handlers}
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
            className={`relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-clip rounded-t-[22px] bg-night-plum text-night-petal shadow-2xl shadow-black/40 outline-none ring-1 ring-inset ring-night-petal/10 motion-safe:duration-300 motion-safe:ease-calm motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:slide-in-from-bottom-6 md:flex-none md:rounded-[24px] md:motion-safe:data-[state=open]:slide-in-from-bottom-2 ${
              ready
                ? "md:h-[min(820px,calc(100dvh-max(24px,8vh)-24px))] md:max-w-[960px]"
                : "md:max-h-[min(820px,calc(100dvh-max(24px,8vh)-24px))] md:max-w-[min(1200px,90vw)]"
            }`}
          >
            <DropOverlay show={drop.dragging} />
            <header className="flex shrink-0 items-center gap-3 border-b border-night-petal/10 py-1.5 pl-4 pr-1.5 sm:pl-5">
              <MoonPhase lit={lit} size={24} className="shrink-0 text-night-rose" />
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="text-[15px] font-semibold leading-tight">Majnu</DialogPrimitive.Title>
                <p className="truncate text-[13px] leading-snug text-night-lilac" role="status" aria-live="polite">
                  {statusText ?? (wrap.stage === "ready" ? "Your gift is wrapped" : wrapping ? "Wrapping your gift" : "Finding a gift with you")}
                </p>
              </div>
              <DialogPrimitive.Close
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-night-lilac transition-colors duration-200 hover:bg-night-petal/10 hover:text-night-petal ${focusRing}`}
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </DialogPrimitive.Close>
            </header>
            <DialogPrimitive.Description className="sr-only">
              Majnu suggests six gifts for the person you describe, and wraps the one you choose in a page you can send.
            </DialogPrimitive.Description>

            {/* From md up the panel is as tall as this, up to its maximum; then this scrolls. */}
            <div ref={scroller} data-finder-scroller="" className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${ready ? "" : "md:flex-initial"}`}>
              <div className={`px-4 pt-4 sm:px-5 ${ready ? "pb-6 md:flex md:h-full md:flex-col md:pb-5" : wrapping ? "pb-4" : "pb-6"}`}>
                {chips.length > 0 && !wrapping && (
                  <div className="mb-4">
                    <p className="text-xs text-night-lilac">Their profile so far. Tap one to change it.</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Their profile so far">
                      {chips.map((c) => (
                        <li key={c.key}>
                          <button
                            type="button"
                            onClick={() => prefill(c.prefill)}
                            aria-label={c.description}
                            className={`relative inline-flex h-7 items-center rounded-full bg-night-velvet px-2.5 text-xs font-medium text-night-petal ring-1 ring-inset ring-night-petal/10 transition-colors duration-200 before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] hover:ring-night-petal/35 ${focusRing}`}
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
                  <WrapView key={wrap.option.id} finder={finder} wrap={wrap} />
                ) : (
                  <Conversation
                    state={state}
                    onSend={(text) => void send(text)}
                    onChoose={choose}
                    onAnswer={finder.answer}
                    onProfile={finder.setProfile}
                    onSendAnswers={() => submit()}
                    draftReady={draft.trim() !== ""}
                    onNewSearch={() => {
                      finder.reset()
                      setDraft("")
                      attachments.clear()
                      requestAnimationFrame(() => composer.current?.focus())
                    }}
                  />
                )}
              </div>
            </div>

            {(wrap.stage === "choose" || wrap.stage === "wrapping") && <WrapFooter wrap={wrap} onNext={finder.nextStep} onPrevious={finder.previousStep} last={!composing} />}

            {composing && (
              <form onSubmit={submit} className="shrink-0 border-t border-night-petal/10 bg-night-plum px-4 pb-[max(10px,var(--safe-bottom))] pt-2.5 sm:px-5">
                <AttachmentTray items={attachments.items} preparing={attachments.preparing} error={attachments.error} onRemove={attachments.remove} />
                <div className="flex items-end gap-1 rounded-[22px] bg-night-velvet py-1 pl-1 pr-1 ring-1 ring-inset ring-night-petal/15 transition-shadow duration-200 focus-within:ring-night-rose/60">
                  {/* Photos and documents about the person (issue #77). */}
                  <AttachButton onFiles={(files) => void attachments.add(files)} disabled={state.streaming} />
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
                    onPaste={(e) => {
                      // A pasted photo or screenshot becomes a preview; text pastes as usual.
                      const files = filesFromClipboard(e.clipboardData)
                      if (files.length === 0) return
                      e.preventDefault()
                      void attachments.add(files)
                    }}
                    enterKeyHint="send"
                    maxLength={1000}
                    placeholder={wrapping ? WRAP_PLACEHOLDER : answering ? ANSWER_PLACEHOLDER : MORE_PLACEHOLDER}
                    className="max-h-[112px] min-h-[40px] min-w-0 flex-1 resize-none appearance-none rounded-none border-0 bg-transparent px-0 py-2 text-[16px] leading-6 shadow-none placeholder:truncate placeholder:leading-6 text-night-petal placeholder:text-night-lilac/70 focus:outline-none"
                  />
                  <VoiceButton
                    ensureSession={() => transport.ensureSession(() => checkHostRef.current)}
                    onText={(text) => {
                      // Added to the draft for the visitor to check and send.
                      setDraft((current) => (current.trim() ? `${current.trimEnd()} ${text}` : text).slice(0, 1000))
                      requestAnimationFrame(() => {
                        const el = composer.current
                        if (!el) return
                        el.focus()
                        el.setSelectionRange(el.value.length, el.value.length)
                      })
                    }}
                  />
                  <button
                    type="submit"
                    aria-label="Send"
                    // Focus stays in the message box, so the keyboard stays up mid-tap.
                    onMouseDown={(e) => e.preventDefault()}
                    aria-disabled={state.streaming || !sendable}
                    className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-night-rose text-night-plum transition-[background-color,opacity,transform] duration-200 before:absolute before:-inset-0.5 before:content-[''] hover:bg-[#F1C4A9] active:scale-95 aria-disabled:opacity-50 ${focusRing}`}
                  >
                    <ArrowUp className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </form>
            )}

            <p className="sr-only" aria-live="polite">
              {state.streaming ? "" : finderAnnouncement(state.items)}
            </p>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
