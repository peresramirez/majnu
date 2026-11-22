"use client"

import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { ArrowRight, MessageCircle } from "lucide-react"
import { FinderDialog } from "@/components/finder/finder-dialog"
import { focusRing } from "@/components/finder/styles"
import { fetchTransport, type FinderTransport } from "@/components/finder/transport"
import { useTypewriter } from "@/components/finder/typewriter"
import { useFinder } from "@/components/finder/use-finder"
import { VoiceButton } from "@/components/voice/voice-button"

// Typed out in the message box one after another. Short enough to fit on one
// line beside the microphone and the button on a 320px phone (158px of text,
// measured), so the box never changes height.
export const EXAMPLES = [
  "A gift for my mother",
  "A gift for my girlfriend",
  "A gift for my sister",
  "A gift for my dad",
] as const

export type Suggestion = { label: string; message: string }

// One tap sends the whole request, so a visitor from an ad sees gifts at once.
export const SUGGESTIONS: Suggestion[] = [
  { label: "My mother", message: "Find a gift for my mother" },
  { label: "My girlfriend", message: "Find a gift for my girlfriend" },
  { label: "My best friend", message: "Find a gift for my best friend" },
  { label: "A colleague who's leaving", message: "Find a gift for a colleague who's leaving" },
]

// The box grows with the text up to four lines, then scrolls: 4 × 24px + 20px padding.
const MAX_HEIGHT = 116

// A 32px chip with a 44px tap area: the pseudo-element extends it 6px up and down.
const suggestionChip = `relative inline-flex h-8 items-center rounded-full bg-night-plum/60 px-3.5 text-sm font-medium text-night-petal ring-1 ring-inset ring-night-petal/20 backdrop-blur-sm transition-[background-color,box-shadow,transform] duration-200 ease-calm before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] hover:bg-night-petal/10 hover:ring-night-petal/40 active:scale-[0.97] ${focusRing}`

type Props = {
  // /dev/finder passes a mock; the landing page uses the real routes.
  transport?: FinderTransport
  suggestions?: Suggestion[]
}

// The landing page's chat box: the page's headline, Majnu's greeting in a small
// bubble, a one-line message box with the button inside it, and a row of
// suggestions. Sending opens the finder.
export function HeroFinder({ transport = fetchTransport, suggestions = SUGGESTIONS }: Props) {
  const finder = useFinder(transport)
  const [value, setValue] = useState("")
  const [open, setOpen] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  // Where the bot check may show itself if the microphone is the first thing a
  // visitor uses: recording needs the same guest session as a search.
  const checkHost = useRef<HTMLDivElement>(null)
  const placeholder = useTypewriter(EXAMPLES, value === "" && !open)
  const hasConversation = finder.state.items.length > 0

  // Grow with the text. Empty, it keeps its one-line height from CSS, so the
  // typed placeholder never moves anything.
  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = ""
    if (value && el.scrollHeight > el.clientHeight) el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  function start(message: string) {
    if (!finder.restart(message)) return false
    setOpen(true)
    return true
  }

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!value.trim()) {
      field.current?.focus()
      return
    }
    if (start(value)) setValue("")
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="w-full max-w-[540px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-700">
      <h1 id="hero-title" className="text-balance font-display text-[30px] leading-[1.08] tracking-[-0.01em] text-night-petal sm:text-[38px] md:text-[44px] lg:text-[46px]">
        Find the right gift for someone you love
      </h1>

      {/* Majnu speaks first, from beside its crescent. */}
      <div className="mt-5 flex items-center gap-2.5 md:mt-6">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-night-velvet ring-1 ring-inset ring-night-rose/30"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/majnu-mark.svg" alt="" width={16} height={16} className="h-4 w-4" />
        </span>
        <p
          id="finder-greeting"
          className="min-w-0 rounded-[16px] rounded-bl-md bg-night-velvet/80 px-3.5 py-2 text-[15px] leading-snug text-night-petal/90 ring-1 ring-inset ring-night-petal/10 backdrop-blur-sm"
        >
          Hi, I&rsquo;m Majnu. Who is the gift for?
        </p>
      </div>

      <form id="find" onSubmit={submit} className="mt-3 scroll-mt-28" aria-labelledby="finder-hero-label">
        <div className="group/row flex items-end gap-2 rounded-[26px] bg-night-plum/85 p-1.5 pl-4 shadow-[0_18px_48px_-20px_rgba(0,0,0,0.75)] ring-1 ring-inset ring-night-petal/20 backdrop-blur-md transition-shadow duration-200 ease-calm focus-within:ring-2 focus-within:ring-night-rose/70">
          <label id="finder-hero-label" htmlFor="finder-hero-message" className="sr-only">
            Who is the gift for?
          </label>
          {/* 44px tall: 10px + one 24px line + 10px, so the text and the typed
              example sit centred beside the 44px buttons. appearance-none and
              the zeroed border, radius and shadow drop iOS Safari's own textarea
              styling, which otherwise nudges the placeholder off that line. */}
          <textarea
            id="finder-hero-message"
            ref={field}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            enterKeyHint="send"
            maxLength={1000}
            rows={1}
            className="block h-11 max-h-[116px] min-w-0 flex-1 resize-none appearance-none rounded-none border-0 bg-transparent px-0 py-2.5 text-[16px] leading-6 shadow-none placeholder:leading-6 text-night-petal placeholder:text-night-lilac/75 focus:outline-none group-has-[[data-voice-phase]:not([data-voice-phase=idle])]/row:placeholder:text-transparent"
          />
          {/* Speak instead of typing (issue #37). The words land in the box for
              the visitor to check; nothing is sent until they press the button.
              While it records, the cancel button and timer take the room the
              typed example needs, so the example is hidden until it is done. */}
          <VoiceButton
            className="mb-0.5"
            ensureSession={() => finder.transport.ensureSession(() => checkHost.current)}
            onText={(text) => {
              setValue((current) => (current.trim() ? `${current.trimEnd()} ${text}` : text).slice(0, 1000))
              requestAnimationFrame(() => {
                const el = field.current
                if (!el) return
                el.focus()
                el.setSelectionRange(el.value.length, el.value.length)
              })
            }}
          />
          {/* An arrow on phones, so the typed examples keep their line; words from sm up. */}
          <button
            type="submit"
            aria-label="Find a gift"
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-full bg-night-rose text-[15px] font-semibold text-night-plum transition-[background-color,transform] duration-200 ease-calm hover:bg-[#F1C4A9] active:scale-[0.97] sm:w-auto sm:px-5 ${focusRing}`}
          >
            <span className="hidden sm:inline" aria-hidden="true">
              Find a gift
            </span>
            <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>
        <div ref={checkHost} className="flex justify-start empty:hidden [&:not(:empty)]:mt-3" />
      </form>

      {/* The way back to the finder hangs below the chips once there is a
          conversation. It takes no space in the layout, so nothing moves when
          it appears. */}
      <div className="relative mt-4">
        <ul className="flex flex-wrap gap-x-2 gap-y-3" aria-label="Start with">
          {suggestions.map((s) => (
            <li key={s.label}>
              <button type="button" onClick={() => start(s.message)} className={suggestionChip}>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
        {hasConversation && (
          <div className="absolute left-0 top-full pt-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={`relative inline-flex h-8 items-center gap-1.5 rounded-full bg-night-petal/[0.06] px-3 text-[13px] font-medium text-night-petal ring-1 ring-inset ring-night-petal/15 backdrop-blur-sm transition-colors duration-200 ease-calm before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] hover:bg-night-petal/10 hover:ring-night-petal/35 ${focusRing}`}
            >
              <MessageCircle className="h-3.5 w-3.5 text-night-rose" aria-hidden="true" />
              Back to your gift ideas
            </button>
          </div>
        )}
      </div>

      <FinderDialog finder={finder} open={open} onOpenChange={setOpen} />
    </div>
  )
}
