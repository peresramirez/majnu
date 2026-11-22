"use client"

// The gift finder inline, as the signed-in app's Find a gift tab (issue #47):
// the same conversation, gift ideas, personalising, wrapping and voice input as
// the landing page's finder dialog, built from the same parts (useFinder,
// Conversation, WrapView, the context chips), filling the app shell's main area
// instead of a modal.
//
// FinderProvider keeps one finder for the whole app shell, so the conversation
// and a gift being wrapped are still there after a visit to My gifts.
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { ArrowRight, ArrowUp, RotateCcw } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { EXAMPLES, SUGGESTIONS, type Suggestion } from "@/components/landing/hero-finder"
import { VoiceButton } from "@/components/voice/voice-button"
import { contextChips } from "./context-chips"
import { Conversation } from "./conversation"
import { finderAnnouncement, statusLit } from "./finder-state"
import { focusRing } from "./styles"
import { fetchTransport, type FinderTransport } from "./transport"
import { useTypewriter } from "./typewriter"
import { useFinder, type Finder } from "./use-finder"
import { WrapFooter, WrapView } from "./wrap-view"

const SharedFinder = createContext<Finder | null>(null)

export function FinderProvider({ transport = fetchTransport, children }: { transport?: FinderTransport; children: ReactNode }) {
  const finder = useFinder(transport)
  return <SharedFinder.Provider value={finder}>{children}</SharedFinder.Provider>
}

// The panel on the app's shared finder.
export function SharedFinderPanel({ suggestions }: { suggestions?: Suggestion[] }) {
  const finder = useContext(SharedFinder)
  if (!finder) throw new Error("SharedFinderPanel needs a FinderProvider around it")
  return <FinderPanel finder={finder} suggestions={suggestions} />
}

// Four lines, then the box scrolls: 4 × 24px + 16px padding.
const MAX_COMPOSER_HEIGHT = 112

// A 40px chip with a 44px tap area.
const suggestionChip = `relative inline-flex h-10 items-center rounded-full bg-night-velvet px-4 text-[15px] font-medium text-night-petal ring-1 ring-inset ring-night-petal/15 transition-[box-shadow,transform] duration-200 ease-calm before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-[''] hover:ring-night-petal/40 active:scale-[0.97] ${focusRing}`

type Props = {
  finder: Finder
  suggestions?: Suggestion[]
}

// Empty, it greets with "Who is the gift for?", the suggestions and the
// message box with its microphone, in that order for every reader: on phones
// they sit at the bottom, by the thumb and above the tab bar; from md up they
// are centred together. Once a
// conversation starts it reads like the finder dialog: a status line with the
// moon filling as Majnu works, the conversation, and the message box pinned
// to the bottom (the tab bar steps aside while it has focus on a phone).
export function FinderPanel({ finder, suggestions = SUGGESTIONS }: Props) {
  const { state, wrap, send, reset, choose, chooseTemplate, wrapGift, backToIdeas, checkHostRef, transport } = finder
  const [draft, setDraft] = useState("")
  const composer = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const seen = useRef<string | null>(null)
  const empty = state.items.length === 0
  const wrapping = wrap.stage !== "closed"
  const ready = wrap.stage === "ready"
  const chips = contextChips(state.context)
  const placeholder = useTypewriter(EXAMPLES, empty && draft === "")

  // Grow the message box with its text, up to a few lines.
  useLayoutEffect(() => {
    const el = composer.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`
  }, [draft, wrapping, empty])

  // With a mouse or trackpad, the empty finder is ready to type into. Phones
  // are left alone, so the keyboard does not cover the suggestions.
  useEffect(() => {
    if (empty && window.matchMedia("(pointer: fine)").matches) composer.current?.focus({ preventScroll: true })
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Follow the conversation: new gift ideas scroll to their top (so all three
  // can be read from the first), anything else to the bottom while the reader
  // is already near it. Coming back to the tab jumps to where it left off.
  const lastItem = state.items[state.items.length - 1]
  const lastText = lastItem?.role === "assistant" ? lastItem.text.length : 0
  useEffect(() => {
    const el = scroller.current
    if (!el || wrapping || !lastItem) return
    const arriving = seen.current === null
    const smooth = !arriving && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const isNew = seen.current !== lastItem.id
    seen.current = lastItem.id
    if (isNew && lastItem.role === "options") {
      const blocks = el.querySelectorAll<HTMLElement>("[data-options]")
      const block = blocks[blocks.length - 1]
      if (block) {
        const top = block.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 16
        el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" })
      }
      return
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (arriving || nearBottom || (isNew && lastItem.role === "user")) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" })
  }, [lastItem, lastText, wrapping])

  // Opening the wrap step, and the finished gift, put focus on the new heading.
  // Going back shows the newest gift ideas again, with focus on the message
  // box for a keyboard, or on the conversation on a phone (no keyboard pops up).
  const previousStage = useRef(wrap.stage)
  useEffect(() => {
    const from = previousStage.current
    previousStage.current = wrap.stage
    if (wrap.stage === "closed" && from !== "closed") {
      const el = scroller.current
      const blocks = el?.querySelectorAll<HTMLElement>("[data-options]")
      const block = blocks?.[blocks.length - 1]
      if (el && block) el.scrollTo({ top: block.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 16 })
      if (window.matchMedia("(pointer: fine)").matches) composer.current?.focus({ preventScroll: true })
      else el?.focus({ preventScroll: true })
      return
    }
    const entered = (wrap.stage === "choose" && from === "closed") || (wrap.stage === "ready" && from !== "ready")
    if (!entered) return
    scroller.current?.scrollTo({ top: 0 })
    panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true })
  }, [wrap.stage])

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!draft.trim()) {
      composer.current?.focus()
      return
    }
    if (send(draft)) setDraft("")
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  function focusComposerAtEnd() {
    requestAnimationFrame(() => {
      const el = composer.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  function prefill(text: string) {
    setDraft(text)
    focusComposerAtEnd()
  }

  function newSearch() {
    reset()
    setDraft("")
    seen.current = null
    requestAnimationFrame(() => composer.current?.focus())
  }

  const lit = statusLit(state)
  const statusText = state.status ?? (state.streaming ? "Majnu is writing…" : null)
  const column = `mx-auto w-full px-4 sm:px-6 ${ready ? "max-w-[960px]" : "max-w-[720px]"}`

  return (
    <div ref={panel} className={`flex h-full min-h-0 flex-col ${empty ? "md:justify-center md:pb-[6vh]" : ""}`}>
      {!empty && (
        <div className="flex-none border-b border-night-petal/10">
          <div className={`${column} flex items-center gap-3 py-2`}>
            <h1 className="sr-only">Find a gift</h1>
            <MoonPhase lit={lit} size={24} className="shrink-0 text-night-rose" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold leading-tight">Majnu</p>
              <p className="truncate text-[13px] leading-snug text-night-lilac" role="status" aria-live="polite">
                {statusText ?? (ready ? "Your gift is wrapped" : wrapping ? "Wrapping your gift" : "Finding a gift with you")}
              </p>
            </div>
            <button
              type="button"
              onClick={newSearch}
              className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-night-lilac transition-colors duration-200 ease-calm hover:bg-night-petal/[0.06] hover:text-night-petal ${focusRing}`}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              New search
            </button>
          </div>
        </div>
      )}

      <div
        ref={scroller}
        tabIndex={-1}
        className={`min-h-0 overflow-y-auto overscroll-contain outline-none ${empty ? "flex flex-1 flex-col md:flex-none" : "flex-1"}`}
      >
        {empty ? (
          <div className={`${column} mt-auto pb-5 pt-8 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-700 md:mt-0 md:pb-6`}>
            <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-night-velvet ring-1 ring-inset ring-night-rose/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/majnu-mark.svg" alt="" width={20} height={20} className="h-5 w-5" />
            </span>
            <h1 id="finder-panel-title" className="mt-5 text-balance font-display text-[34px] leading-[1.08] tracking-[-0.01em] sm:text-[44px]">
              Who is the gift for?
            </h1>
            <p className="mt-3 max-w-[52ch] text-[16px] leading-relaxed text-night-lilac sm:text-[17px]">
              Describe them in a few words, or say it. Majnu finds three gifts that suit them, from shops where you live,
              and wraps the one you choose in a page made for them.
            </p>
            <div ref={checkHostRef} className="flex justify-start empty:hidden [&:not(:empty)]:mt-4" />
          </div>
        ) : (
          <div className={`${column} pt-4 ${ready ? "pb-6 md:flex md:h-full md:flex-col md:pb-5" : wrapping ? "pb-4" : "pb-6"}`}>
            {chips.length > 0 && !wrapping && (
              <div className="mb-4">
                <p className="text-xs text-night-lilac">Majnu assumed this. Tap one to change it.</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="What Majnu assumed">
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
              <WrapView
                key={wrap.option.id}
                wrap={wrap}
                context={state.context}
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
        )}
      </div>

      {empty && (
        <div className="flex-none">
          <ul className={`${column} flex flex-wrap gap-2 pb-4`} aria-label="Start with">
            {suggestions.map((s) => (
              <li key={s.label}>
                <button type="button" onClick={() => void send(s.message)} className={suggestionChip}>
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The wrap form's button bar, lined up with the column above it. */}
      {(wrap.stage === "choose" || wrap.stage === "wrapping") && (
        <div className="flex-none border-t border-night-petal/10 bg-night-plum">
          <div className={`mx-auto w-full sm:px-1 ${ready ? "max-w-[960px]" : "max-w-[720px]"} [&>div]:border-t-0 [&>div]:pb-2.5`}>
            <WrapFooter wrap={wrap} />
          </div>
        </div>
      )}

      {!wrapping && (
        <form
          onSubmit={submit}
          aria-label="Message to Majnu"
          className={`flex-none bg-night-plum ${empty ? "border-t border-night-petal/10 md:border-t-0 md:bg-transparent" : "border-t border-night-petal/10"}`}
        >
          <div className={`${column} pb-3 pt-2.5 ${empty ? "md:py-0" : ""}`}>
            <div
              className={`group/row flex items-end gap-2 rounded-[22px] bg-night-velvet py-1 pl-4 pr-1 ring-1 ring-inset ring-night-petal/15 transition-shadow duration-200 ease-calm focus-within:ring-2 focus-within:ring-night-rose/60 ${
                empty ? "md:rounded-[26px] md:py-1.5 md:pr-1.5 md:shadow-[0_18px_48px_-20px_rgba(0,0,0,0.75)]" : ""
              }`}
            >
              <label htmlFor="finder-panel-message" className="sr-only">
                {empty ? "Who is the gift for?" : "Message to Majnu"}
              </label>
              <textarea
                id="finder-panel-message"
                ref={composer}
                // The shell hides the phone tab bar while a message box with
                // this attribute has focus, to give the keyboard the room.
                data-composer=""
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                enterKeyHint="send"
                maxLength={1000}
                placeholder={empty ? placeholder : "Tell Majnu more about them"}
                className="max-h-[112px] min-h-[40px] min-w-0 flex-1 resize-none bg-transparent py-2 text-[16px] leading-6 text-night-petal placeholder:text-night-lilac/70 focus:outline-none group-has-[[data-voice-phase]:not([data-voice-phase=idle])]/row:placeholder:text-transparent"
              />
              {/* Speak instead of typing (issue #37): the words land in the box
                  for the sender to check, and nothing is sent until they do. */}
              <VoiceButton
                ensureSession={() => transport.ensureSession(() => checkHostRef.current)}
                onText={(text) => {
                  setDraft((current) => (current.trim() ? `${current.trimEnd()} ${text}` : text).slice(0, 1000))
                  focusComposerAtEnd()
                }}
              />
              {empty ? (
                // An arrow on phones, so the typed examples keep their line; words from sm up.
                <button
                  type="submit"
                  aria-label="Find a gift"
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-full bg-night-rose text-[15px] font-semibold text-night-plum transition-[background-color,transform] duration-200 ease-calm hover:bg-[#F1C4A9] active:scale-[0.97] sm:w-auto sm:px-5 ${focusRing}`}
                >
                  <span className="hidden sm:inline" aria-hidden="true">
                    Find a gift
                  </span>
                  <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="submit"
                  aria-label="Send"
                  aria-disabled={state.streaming || !draft.trim()}
                  className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-night-rose text-night-plum transition-[background-color,opacity,transform] duration-200 ease-calm before:absolute before:-inset-0.5 before:content-[''] hover:bg-[#F1C4A9] active:scale-95 aria-disabled:opacity-50 ${focusRing}`}
                >
                  <ArrowUp className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </form>
      )}

      <p className="sr-only" aria-live="polite">
        {state.streaming ? "" : finderAnnouncement(state.items)}
      </p>
    </div>
  )
}
