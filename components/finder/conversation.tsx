"use client"

import Link from "next/link"
import { Check, Paperclip, RotateCcw } from "lucide-react"
import type { GiftOption } from "@/lib/finder/events"
import {
  CATALOGUE_OFFER,
  NO_PROFILE,
  OTHER_ANSWER,
  OTHER_PLACEHOLDER,
  PERSONALISE_MESSAGE,
  PROFILE_FIELD_LABEL,
  SEND_ANSWERS,
  latestOptionsIndex,
  noticeRole,
  openQuestions,
  pickedAnswer,
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
  // Issue #97: the visitor's own words for a question's "Other" answer.
  onOther?: (itemId: string, text: string) => void
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
export function Conversation({ state, onSend, onChoose, onNewSearch, onAnswer, onProfile, onOther, onSendAnswers, draftReady = false }: Props) {
  const { items, streaming } = state
  const newestOptions = latestOptionsIndex(items)
  // The questions still open; the last one ends with the profile field and "Send answers".
  const open = openQuestions(items)
  const lastOpenId = open.length > 0 ? open[open.length - 1].id : null
  const picked = open.some((q) => pickedAnswer(state, q.id)) || (showsProfileField(state) && (state.profile.none || state.profile.link.trim() !== ""))
  // While Majnu works, a small loader closes the conversation (developer's
  // request, 22 November): before its first words, while it searches or reads
  // a profile, and between messages while it thinks. With the step it is on
  // ("Searching shops…"), "Thinking…" when there is none, and only the dots
  // while its words are arriving.
  const lastRole = items[items.length - 1]?.role
  const loaderLabel = state.status ?? (lastRole === "user" ? "Reading your message…" : lastRole === "assistant" ? null : "Thinking…")
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
                {showPersonalise && item.catalogue && (
                  <div className="mt-4 rounded-[18px] bg-night-petal/[0.04] px-4 py-3.5 ring-1 ring-inset ring-night-petal/15">
                    <p className="text-[15px] font-semibold text-night-petal">{CATALOGUE_OFFER}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-night-lilac">
                      Answer a few quick questions and Majnu looks for six gifts that suit them.
                    </p>
                    <button type="button" className={`${smallPrimary} mt-3`} onClick={() => onSend(PERSONALISE_MESSAGE)}>
                      {PERSONALISE_MESSAGE}
                    </button>
                  </div>
                )}
                {showPersonalise && !item.catalogue && (
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
                      {/* Issue #97: the visitor's own answer, typed in a small field. */}
                      <button
                        type="button"
                        aria-pressed={chosen === OTHER_ANSWER}
                        aria-controls={`${item.id}-other`}
                        className={`${chip} ${chosen === OTHER_ANSWER ? pickedChip : ""}`}
                        disabled={streaming}
                        onClick={() => onAnswer(item.id, OTHER_ANSWER)}
                      >
                        {chosen === OTHER_ANSWER && <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
                        {OTHER_ANSWER}
                      </button>
                    </div>
                  )}
                  {isOpen && chosen === OTHER_ANSWER && (
                    <div className="mt-2">
                      <label htmlFor={`${item.id}-other`} className="sr-only">
                        {item.label ? `${item.label}: ${OTHER_PLACEHOLDER}` : OTHER_PLACEHOLDER}
                      </label>
                      <input
                        id={`${item.id}-other`}
                        type="text"
                        autoComplete="off"
                        enterKeyHint="done"
                        maxLength={200}
                        autoFocus
                        value={state.others[item.id] ?? ""}
                        disabled={streaming}
                        placeholder={OTHER_PLACEHOLDER}
                        onChange={(e) => onOther?.(item.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.nativeEvent.isComposing) e.preventDefault()
                        }}
                        className="h-9 w-full max-w-[22rem] rounded-full bg-night-velvet px-3.5 text-[16px] text-night-petal ring-1 ring-inset ring-night-petal/20 placeholder:text-night-lilac/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-night-rose/60 disabled:opacity-50 sm:text-[14px]"
                      />
                    </div>
                  )}
                  {!isOpen && chosen && (chosen !== OTHER_ANSWER || pickedAnswer(state, item.id)) && (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-night-rose/10 px-3 py-1 text-[13px] font-medium text-night-petal ring-1 ring-inset ring-night-rose/40">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only">You answered: </span>
                      {chosen === OTHER_ANSWER ? state.others[item.id]?.trim() : chosen}
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
      {streaming && (
        <li aria-hidden="true" data-finder-loader>
          <Said>
            <span className="flex items-center gap-2.5 text-[15px] text-night-lilac">
              <span className="flex h-5 items-center gap-1">
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="h-1.5 w-1.5 rounded-full bg-night-rose opacity-60 motion-safe:animate-[finder-dot_1.2s_ease-in-out_infinite]"
                    style={{ animationDelay: `${dot * 0.16}s` }}
                  />
                ))}
              </span>
              {loaderLabel && <span className="motion-safe:animate-[moon-breathe_2.4s_ease-in-out_infinite]">{loaderLabel}</span>}
            </span>
          </Said>
        </li>
      )}
    </ol>
  )
}
