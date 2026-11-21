"use client"

import Link from "next/link"
import { RotateCcw } from "lucide-react"
import type { GiftOption } from "@/lib/finder/events"
import { PERSONALISE_MESSAGE, latestOptionsIndex, type FinderItem, type FinderState } from "./finder-state"
import { GiftOptionCard } from "./gift-option-card"
import { RichText } from "./rich-text"
import { chip, secondaryButton, smallButton, textLink } from "./styles"

type Props = {
  state: FinderState
  onSend: (text: string) => void
  onChoose: (option: GiftOption) => void
}

function MajnuMark() {
  return (
    <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-night-velvet ring-1 ring-inset ring-night-petal/10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/majnu-mark.svg" alt="" width={18} height={18} className="h-[18px] w-[18px]" />
    </span>
  )
}

function Said({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <MajnuMark />
      <div className="min-w-0 flex-1 text-[16px] leading-relaxed text-night-petal/95">{children}</div>
    </div>
  )
}

function Notice({ item, last, busy, onSend }: { item: Extract<FinderItem, { role: "notice" }>; last: boolean; busy: boolean; onSend: (text: string) => void }) {
  const signin = item.reason === "signin_required"
  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      className="ml-11 rounded-2xl bg-night-velvet/70 px-4 py-3.5 text-[15px] leading-relaxed text-night-petal ring-1 ring-inset ring-night-petal/10"
    >
      <p>{item.message}</p>
      {(signin || (item.retry && last)) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          {signin && (
            <>
              <Link href="/signup" className={textLink}>
                Sign up
              </Link>
              <Link href="/signin" className={`text-sm ${textLink} text-night-lilac decoration-night-lilac/40`}>
                I have an account
              </Link>
            </>
          )}
          {item.retry && last && !signin && (
            <button type="button" className={smallButton} disabled={busy} onClick={() => onSend(item.retry!)}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// The visitor has sent something since item `i`: its buttons are spent.
const repliedAfter = (items: FinderItem[], i: number) => items.slice(i + 1).some((later) => later.role === "user")

// The conversation: what the visitor asked, what Majnu said, the gift ideas,
// its questions with tappable answers, and limits or errors.
export function Conversation({ state, onSend, onChoose }: Props) {
  const { items, streaming } = state
  const newestOptions = latestOptionsIndex(items)
  // Between sending and the first words: what Majnu is doing, beside its mark.
  const waiting = streaming && items[items.length - 1]?.role === "user"
  return (
    <ol className="space-y-6" aria-label="Conversation with Majnu">
      {items.map((item, i) => {
        const last = i === items.length - 1
        switch (item.role) {
          case "user":
            return (
              <li key={item.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-[20px] rounded-br-md bg-night-petal/10 px-4 py-2.5 text-[15px] leading-relaxed text-night-petal">
                  <span className="sr-only">You: </span>
                  {item.text}
                </p>
              </li>
            )
          case "assistant":
            return (
              <li key={item.id}>
                <Said>
                  <span className="sr-only">Majnu: </span>
                  <RichText text={item.text} />
                </Said>
              </li>
            )
          case "options": {
            const recommended = item.options.find((o) => o.id === item.recommendedId)
            const showPersonalise = i === newestOptions && !streaming && !repliedAfter(items, i)
            return (
              <li key={item.id} data-options className="scroll-mt-4">
                <h2 className="sr-only">{item.options.length === 1 ? "One gift idea" : `${item.options.length} gift ideas`}</h2>
                <ul className="grid gap-3 md:grid-cols-3 md:gap-4">
                  {item.options.map((option) => (
                    <li key={option.id}>
                      <GiftOptionCard option={option} recommended={option.id === item.recommendedId} onChoose={onChoose} />
                    </li>
                  ))}
                </ul>
                {recommended && item.why && (
                  <p className="mt-4 text-[15px] leading-relaxed text-night-lilac">
                    <span className="font-semibold text-night-petal">Why Majnu recommends the {recommended.title}: </span>
                    {item.why}
                  </p>
                )}
                {showPersonalise && (
                  <div className="mt-5 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <button type="button" className={secondaryButton} onClick={() => onSend(PERSONALISE_MESSAGE)}>
                      {PERSONALISE_MESSAGE}
                    </button>
                    <span className="text-sm text-night-lilac">None quite right? Tell Majnu more about them.</span>
                  </div>
                )}
              </li>
            )
          }
          case "question": {
            // Answers stay tappable until the visitor has replied.
            const open = !repliedAfter(items, i)
            return (
              <li key={item.id}>
                <Said>
                  <span className="sr-only">Majnu asks: </span>
                  <RichText text={item.text} />
                </Said>
                {item.suggestions.length > 0 && open && (
                  <div className="ml-11 mt-3 flex flex-wrap gap-2" role="group" aria-label="Suggested answers">
                    {item.suggestions.map((s) => (
                      <button key={s} type="button" className={chip} disabled={streaming} onClick={() => onSend(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            )
          }
          case "notice":
            return (
              <li key={item.id}>
                <Notice item={item} last={last} busy={streaming} onSend={onSend} />
              </li>
            )
        }
      })}
      {waiting && (
        <li aria-hidden="true">
          <Said>
            <span className="block pt-1 text-[15px] text-night-lilac motion-safe:animate-[moon-breathe_2.4s_ease-in-out_infinite]">
              {state.status ?? "Reading your message…"}
            </span>
          </Said>
        </li>
      )}
    </ol>
  )
}
