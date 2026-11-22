"use client"

import Link from "next/link"
import { Check, Paperclip, RotateCcw } from "lucide-react"
import type { GiftOption } from "@/lib/finder/events"
import {
  NO_PROFILE,
  PERSONALISE_MESSAGE,
  PROFILE_FIELD_LABEL,
  SEND_ANSWERS,
  latestOptionsIndex,
  noticeRole,
  openQuestions,
  showsProfileField,
  type FinderItem,
  type FinderState,
} from "./finder-state"
import { GiftOptionCard } from "./gift-option-card"
import { RichText } from "./rich-text"
import { chip, smallButton, smallPrimary } from "./styles"

type Props = {
  state: FinderState
  onSend: (text: string) => void
  onChoose: (option: GiftOption) => void
  // Starts an empty search: offered when this one is full (issue #70).
  onNewSearch?: () => void
  // Issue #82: picking an answer, the profile field, and sending the answers
  // (with whatever is in the message box) as one message.
  onAnswer: (itemId: string, value: string) => void
  onProfile: (change: { link?: string; none?: boolean }) => void
  onSendAnswers: () => void
  // The message box has words or files, so the answers can be sent without a pick.
  draftReady?: boolean
}

// A picked answer: filled, with a check. Unpicked ones stay outlined.
const pickedChip = "bg-night-rose/15 ring-night-rose/70 text-night-petal hover:bg-night-rose/20"

function ProfileField({
  state,
  onProfile,
  onSendAnswers,
}: Pick<Props, "state" | "onProfile" | "onSendAnswers">) {
  const { link, none } = state.profile
  return (
    <div className="mt-4">
      <label htmlFor="finder-profile-answer" className="block text-[13px] font-medium text-night-lilac">
        {PROFILE_FIELD_LABEL}
      </label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input
          id="finder-profile-answer"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          maxLength={300}
          value={link}
          disabled={state.streaming}
          placeholder="instagram.com/name, linkedin.com/in/name"
          onChange={(e) => onProfile({ link: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault()
              onSendAnswers()
            }
          }}
          className={`h-9 min-w-0 flex-1 basis-[12rem] rounded-full bg-night-velvet px-3.5 text-[16px] text-night-petal ring-1 ring-inset ring-night-petal/20 placeholder:text-night-lilac/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-night-rose/60 disabled:opacity-50 sm:text-[14px]`}
        />
        <button
          type="button"
          aria-pressed={none}
          disabled={state.streaming}
          onClick={() => onProfile({ none: !none })}
          className={`${chip} ${none ? pickedChip : ""}`}
        >
          {none && <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
          {NO_PROFILE}
        </button>
      </div>
    </div>
  )
}

// Under the newest ideas: what else Majnu can use to tailor the next search
// (issue #70). It reads only links and handles the visitor gives.
// Short enough for one line beside the microphone at 375px; the line under
// the ideas (TELL_MORE) says what "more" can be.
export const MORE_PLACEHOLDER = "Tell Majnu more about them"

export const TELL_MORE = "Tell Majnu more: their Instagram, TikTok or LinkedIn, what they love, what they talk about."

function MajnuMark() {
  return (
    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-night-velvet ring-1 ring-inset ring-night-petal/10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/majnu-mark.svg" alt="" width={14} height={14} className="h-3.5 w-3.5" />
    </span>
  )
}

function Said({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <MajnuMark />
      <div className="min-w-0 flex-1 pt-0.5 text-[15px] leading-relaxed text-night-petal/95">{children}</div>
    </div>
  )
}

function Notice({
  item,
  last,
  busy,
  onSend,
  onNewSearch,
}: {
  item: Extract<FinderItem, { role: "notice" }>
  last: boolean
  busy: boolean
  onSend: (text: string) => void
  onNewSearch?: () => void
}) {
  const signin = item.reason === "signin_required"
  const full = item.reason === "session_full" && last && onNewSearch !== undefined
  return (
    <div
      // Heard once: an error as this alert, a limit from the finder's live region.
      role={noticeRole(item)}
      className="ml-[38px] rounded-2xl bg-night-velvet/70 px-4 py-3 text-[15px] leading-relaxed text-night-petal ring-1 ring-inset ring-night-petal/10"
    >
      <p>{item.message}</p>
      {(signin || full || (item.retry && last)) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {signin && (
            <>
              <Link href="/signup" className={smallPrimary}>
                Sign up
              </Link>
              <Link href="/signin" className={smallButton}>
                Sign in
              </Link>
            </>
          )}
          {full && (
            <button type="button" className={smallButton} disabled={busy} onClick={onNewSearch}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Start a new search
            </button>
          )}
          {item.retry && last && !signin && !full && (
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
export function Conversation({ state, onSend, onChoose, onNewSearch, onAnswer, onProfile, onSendAnswers, draftReady = false }: Props) {
  const { items, streaming } = state
  const newestOptions = latestOptionsIndex(items)
  // The questions still open; the last one ends with the profile field and "Send answers".
  const open = openQuestions(items)
  const lastOpenId = open.length > 0 ? open[open.length - 1].id : null
  const picked = open.some((q) => state.answers[q.id]) || (showsProfileField(state) && (state.profile.none || state.profile.link.trim() !== ""))
  // Between sending and the first words: what Majnu is doing, beside its mark.
  const waiting = streaming && items[items.length - 1]?.role === "user"
  return (
    <ol className="space-y-5" aria-label="Conversation with Majnu">
      {items.map((item, i) => {
        const last = i === items.length - 1
        switch (item.role) {
          case "user":
            return (
              <li key={item.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-[18px] rounded-br-md bg-night-petal/10 px-3.5 py-2 text-[15px] leading-relaxed text-night-petal">
                  <span className="sr-only">You: </span>
                  {item.text && <p className="whitespace-pre-wrap">{item.text}</p>}
                  {/* Photos and documents sent with it (issue #77): only their names. */}
                  {item.files && item.files.length > 0 && (
                    <p className={`flex items-start gap-1.5 text-[13px] text-night-lilac ${item.text ? "mt-1" : ""}`}>
                      <Paperclip className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        <span className="sr-only">Shared: </span>
                        {item.files.map((file) => file.name).join(", ")}
                      </span>
                    </p>
                  )}
                </div>
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
                {/* Six ideas, the recommended one first: a row to swipe on phones (the
                    next card peeks in), three by two from md up. */}
                <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:thin] md:grid md:grid-cols-3 md:overflow-visible md:pb-0">
                  {item.options.map((option) => (
                    <li key={option.id} className="w-[78%] max-w-[300px] shrink-0 snap-start md:w-auto md:max-w-none">
                      <GiftOptionCard option={option} recommended={option.id === item.recommendedId} onChoose={onChoose} />
                    </li>
                  ))}
                </ul>
                {recommended && item.why && (
                  <p className="mt-3 text-sm leading-relaxed text-night-lilac">
                    <span className="font-semibold text-night-petal">Why Majnu recommends the {recommended.title}: </span>
                    {item.why}
                  </p>
                )}
                {showPersonalise && (
                  <div className="mt-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <button type="button" className={smallButton} onClick={() => onSend(PERSONALISE_MESSAGE)}>
                      {PERSONALISE_MESSAGE}
                    </button>
                    <span className="text-[13px] text-night-lilac">{TELL_MORE}</span>
                  </div>
                )}
              </li>
            )
          }
          case "question": {
            // Answers can be picked until the visitor sends (issue #82): then
            // only the one picked stays, marked as the answer.
            const isOpen = !repliedAfter(items, i)
            const chosen = state.answers[item.id]
            return (
              <li key={item.id}>
                <Said>
                  <span className="sr-only">Majnu asks: </span>
                  <RichText text={item.text} />
                </Said>
                <div className="ml-[38px]">
                  {item.suggestions.length > 0 && isOpen && (
                    <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label={item.label ? `Answers: ${item.label}` : "Answers"}>
                      {item.suggestions.map((s) => {
                        const on = chosen === s
                        return (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={on}
                            className={`${chip} ${on ? pickedChip : ""}`}
                            disabled={streaming}
                            onClick={() => onAnswer(item.id, s)}
                          >
                            {on && <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
                            {s}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {!isOpen && chosen && (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-night-rose/10 px-3 py-1 text-[13px] font-medium text-night-petal ring-1 ring-inset ring-night-rose/40">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only">You answered: </span>
                      {chosen}
                    </p>
                  )}
                  {item.id === lastOpenId && (
                    <>
                      {showsProfileField(state) && <ProfileField state={state} onProfile={onProfile} onSendAnswers={onSendAnswers} />}
                      <div className="mt-4">
                        <button
                          type="button"
                          className={`${smallPrimary} aria-disabled:cursor-not-allowed aria-disabled:opacity-50`}
                          aria-disabled={streaming || !(picked || draftReady)}
                          onClick={() => {
                            if (!streaming && (picked || draftReady)) onSendAnswers()
                          }}
                        >
                          {SEND_ANSWERS}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </li>
            )
          }
          case "notice":
            return (
              <li key={item.id}>
                <Notice item={item} last={last} busy={streaming} onSend={onSend} onNewSearch={onNewSearch} />
              </li>
            )
        }
      })}
      {waiting && (
        <li aria-hidden="true">
          <Said>
            <span className="block text-[15px] text-night-lilac motion-safe:animate-[moon-breathe_2.4s_ease-in-out_infinite]">
              {state.status ?? "Reading your message…"}
            </span>
          </Said>
        </li>
      )}
    </ol>
  )
}
