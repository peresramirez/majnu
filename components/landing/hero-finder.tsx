"use client"

import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { ArrowRight } from "lucide-react"
import { FinderDialog } from "@/components/finder/finder-dialog"
import { focusRing, primaryButton } from "@/components/finder/styles"
import { fetchTransport, type FinderTransport } from "@/components/finder/transport"
import { useTypewriter } from "@/components/finder/typewriter"
import { useFinder } from "@/components/finder/use-finder"

// Typed out in the message box one after another.
export const EXAMPLES = [
  "Find a gift for my mother",
  "Find a gift for my girlfriend",
  "Find a gift for my best friend",
  "Find a gift for my dad who loves fishing",
] as const

export type Suggestion = { label: string; message: string }

// One tap sends the whole request, so a visitor from an ad sees gifts at once.
export const SUGGESTIONS: Suggestion[] = [
  { label: "My mother", message: "Find a gift for my mother" },
  { label: "My girlfriend", message: "Find a gift for my girlfriend" },
  { label: "My best friend", message: "Find a gift for my best friend" },
  { label: "A colleague who's leaving", message: "Find a gift for a colleague who's leaving" },
]

const MAX_HEIGHT = 168

type Props = {
  // /dev/finder passes a mock; the landing page uses the real routes.
  transport?: FinderTransport
  suggestions?: Suggestion[]
}

// The landing page's chat box: Majnu's greeting in a speech bubble, a large
// message box whose placeholder types out examples, the button and a row of
// suggestions. Sending opens the finder.
export function HeroFinder({ transport = fetchTransport, suggestions = SUGGESTIONS }: Props) {
  const finder = useFinder(transport)
  const [value, setValue] = useState("")
  const [open, setOpen] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const placeholder = useTypewriter(EXAMPLES, value === "" && !open)
  const hasConversation = finder.state.items.length > 0

  // Grow with the text; the box starts at a fixed height, so nothing shifts on load.
  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = ""
    if (el.scrollHeight > el.clientHeight) el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
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
    <div className="w-full max-w-xl">
      <div className="flex items-end gap-3 sm:gap-4">
        <span
          aria-hidden="true"
          className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-night-velvet ring-1 ring-inset ring-night-rose/30 sm:h-11 sm:w-11"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/majnu-mark.svg" alt="" width={22} height={22} className="h-[22px] w-[22px]" />
        </span>
        {/* Majnu speaks first. The bubble's tail points back at the crescent. */}
        <div className="relative min-w-0 rounded-[24px] rounded-bl-md bg-night-velvet/85 px-5 py-3.5 ring-1 ring-inset ring-night-petal/10 backdrop-blur-sm sm:px-6 sm:py-4">
          <h1 id="finder-greeting" className="font-display text-[26px] leading-[1.15] text-night-petal sm:text-[30px] lg:text-[34px]">
            Who is the gift for?
          </h1>
          <p id="finder-hint" className="mt-1 text-balance text-[15px] leading-relaxed text-night-lilac sm:text-[16px]">
            Tell me a little about them. I&rsquo;ll find three gifts from shops in your country.
          </p>
        </div>
      </div>

      <form id="find" onSubmit={submit} className="mt-5 scroll-mt-28 sm:mt-6" aria-labelledby="finder-greeting">
        <div className="rounded-[28px] bg-night-plum/80 p-2 ring-1 ring-inset ring-night-petal/20 backdrop-blur-sm transition-shadow duration-200 ease-calm focus-within:ring-2 focus-within:ring-night-rose/70">
          <label htmlFor="finder-hero-message" className="sr-only">
            Who is the gift for? Describe them
          </label>
          <textarea
            id="finder-hero-message"
            ref={field}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-describedby="finder-hint"
            enterKeyHint="send"
            maxLength={1000}
            rows={2}
            className="block h-[76px] max-h-[168px] w-full resize-none bg-transparent px-4 pb-1 pt-3 text-[16px] leading-6 text-night-petal placeholder:text-night-lilac/75 focus:outline-none sm:h-[84px] sm:text-[17px] sm:leading-7"
          />
          <div className="flex items-center justify-between gap-3 pl-4">
            <span className="hidden text-[13px] text-night-lilac/80 sm:inline">Free, no account needed</span>
            <button type="submit" className={`${primaryButton} ml-auto`}>
              Find a gift <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </form>

      <div className="mt-4">
        <ul className="flex flex-wrap gap-2" aria-label="Start with">
          {suggestions.map((s) => (
            <li key={s.label}>
              <button
                type="button"
                onClick={() => start(s.message)}
                className={`rounded-full bg-night-plum/60 px-4 py-2 text-sm font-medium text-night-petal ring-1 ring-inset ring-night-petal/20 backdrop-blur-sm transition-colors duration-200 ease-calm hover:bg-night-petal/10 hover:ring-night-petal/40 ${focusRing}`}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 min-h-[20px] text-[13px] text-night-lilac/80">
          {hasConversation ? (
            <button type="button" onClick={() => setOpen(true)} className={`rounded font-semibold text-night-rose underline decoration-night-rose/40 underline-offset-4 ${focusRing}`}>
              Back to your gift ideas
            </button>
          ) : (
            <span className="sm:hidden">Free, no account needed.</span>
          )}
        </p>
      </div>

      <FinderDialog finder={finder} open={open} onOpenChange={setOpen} />
    </div>
  )
}
