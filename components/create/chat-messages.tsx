"use client"

import Link from "next/link"
import { Fragment, type ReactNode } from "react"
import { AlertCircle, ArrowUpRight, ExternalLink } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { WaxingMoon } from "@/components/app/waxing-moon"
import { focusRing, primaryButton } from "@/components/app/styles"
import type { GiftIdea, LimitReason } from "@/lib/agents/events"
import type { TemplateId } from "@/lib/letters/schema"
import { getTemplate } from "@/lib/letters/templates"
import { templateMessage, type ChatItem } from "./chat-state"
import { FullMoonBadge, TemplateIcon } from "./template-bits"

// Starters for an empty chat. Tapping one sends it as the first message.
const suggestions = [
  "A birthday letter for my sister",
  "A thank-you gift card for a friend",
  "An advent calendar for my partner",
]

export function EmptyState({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-1 flex-col justify-end pb-2 sm:justify-center sm:pb-10">
      <MoonPhase lit={0.22} size={36} className="text-night-rose" />
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-night-lilac">New gift</p>
      <h1 className="mt-3 font-display text-[40px] leading-[1.06] tracking-[-0.01em] sm:text-5xl">Who is it for?</h1>
      <p className="mt-4 max-w-md text-[17px] leading-relaxed text-night-lilac">
        Tell Majnu about them and the occasion. A few words are enough to start.
      </p>
      <ul className="mt-8 grid gap-2" aria-label="Ideas to start with">
        {suggestions.map((s) => (
          <li key={s}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(s)}
              className={`group flex w-full items-center justify-between gap-4 rounded-2xl px-4 py-3.5 text-left text-[15px] text-night-petal ring-1 ring-inset ring-night-petal/15 transition-shadow duration-200 ease-calm hover:ring-night-rose/50 disabled:opacity-50 ${focusRing}`}
            >
              {s}
              <ArrowUpRight
                className="h-4 w-4 flex-none text-night-lilac transition-colors duration-200 ease-calm group-hover:text-night-rose"
                aria-hidden="true"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Plain text with paragraphs, line breaks and **bold**. Never renders HTML.
function RichText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim() !== "")
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap [&:not(:first-child)]:mt-3">
          {p.split(/(\*\*[^*\n]+\*\*)/g).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
              <strong key={j} className="font-semibold text-night-petal">
                {part.slice(2, -2)}
              </strong>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            ),
          )}
        </p>
      ))}
    </>
  )
}

// Only links a visitor can safely open.
function safeUrl(url: string | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null
  } catch {
    return null
  }
}

function TemplateSuggestions({ ids, onChoose, disabled }: { ids: TemplateId[]; onChoose: (name: string) => void; disabled: boolean }) {
  const metas = ids.map((id) => getTemplate(id)).filter((t) => t !== undefined)
  if (!metas.length) return null
  return (
    <ul className="-mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0" aria-label="Templates Majnu suggests">
      {metas.map((t) => (
        <li key={t.id} className="w-[15.5rem] flex-none snap-start sm:w-auto">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChoose(t.name)}
            className={`flex h-full w-full flex-col rounded-2xl bg-night-velvet p-4 text-left ring-1 ring-inset ring-night-petal/10 transition-shadow duration-200 ease-calm hover:ring-night-rose/45 disabled:opacity-60 ${focusRing}`}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="text-night-rose">
                <TemplateIcon id={t.id} />
              </span>
              {t.plan === "full-moon" && <FullMoonBadge />}
            </span>
            <span className="mt-3 font-display text-lg leading-snug text-night-petal">{t.name}</span>
            <span className="mt-1 line-clamp-2 text-sm leading-relaxed text-night-lilac">{t.description}</span>
            <span className="mt-3 text-sm font-semibold text-night-rose">Use this one</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function GiftIdeas({ ideas }: { ideas: GiftIdea[] }) {
  return (
    <ul className="mt-4 grid gap-3" aria-label="Gift ideas">
      {ideas.map((idea, i) => {
        const url = safeUrl(idea.url)
        return (
          <li key={`${idea.title}-${i}`} className="rounded-2xl bg-night-velvet p-4 ring-1 ring-inset ring-night-petal/10">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium text-night-petal">{idea.title}</p>
              {idea.price && <p className="flex-none text-sm font-semibold text-night-rose">{idea.price}</p>}
            </div>
            {idea.reason && <p className="mt-1 text-[15px] leading-relaxed text-night-lilac">{idea.reason}</p>}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-3 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-night-petal underline-offset-4 hover:underline ${focusRing}`}
              >
                See it <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}

const upgradeReasons: LimitReason[] = ["full_moon_only", "monthly_gifts"]

function Notice({ tone, message, reason }: { tone: "limit" | "refusal" | "error"; message: string; reason?: LimitReason }) {
  if (tone === "limit" && reason && upgradeReasons.includes(reason)) {
    return (
      <div className="rounded-3xl bg-night-velvet p-5 ring-1 ring-inset ring-night-rose/35">
        <div className="flex items-center gap-3 text-night-rose">
          <MoonPhase lit={1} size={26} />
          <p className="font-display text-xl text-night-petal">Full moon</p>
        </div>
        <p className="mt-3 leading-relaxed text-night-lilac">{message}</p>
        <Link href="/dashboard/plan" className={`mt-5 ${primaryButton} px-5 py-2.5`}>
          Choose Full moon
        </Link>
      </div>
    )
  }
  if (tone === "limit" && reason === "signin_required") {
    // A guest asked for something that needs a real account (an advent calendar).
    // Signing up keeps the guest's gifts: the account is upgraded in place.
    return (
      <div className="rounded-2xl p-4 ring-1 ring-inset ring-night-petal/15">
        <p className="leading-relaxed text-night-petal">{message}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href="/signup?next=%2Fdashboard" className={`${primaryButton} px-5 py-2.5`}>
            Create a free account
          </Link>
          <Link href="/signin?next=%2Fdashboard" className={`inline-flex items-center rounded text-sm font-semibold text-night-rose underline-offset-4 hover:underline ${focusRing}`}>
            I have an account
          </Link>
        </div>
      </div>
    )
  }
  if (tone === "limit") {
    return (
      <div className="rounded-2xl p-4 ring-1 ring-inset ring-night-petal/15">
        <p className="leading-relaxed text-night-petal">{message}</p>
        <Link href="/dashboard/plan" className={`mt-2 inline-block rounded text-sm font-semibold text-night-rose underline-offset-4 hover:underline ${focusRing}`}>
          See your plan
        </Link>
      </div>
    )
  }
  return (
    <div className="flex gap-3 rounded-2xl p-4 ring-1 ring-inset ring-night-petal/15">
      {tone === "error" && <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-[#F2A7A7]" aria-hidden="true" />}
      <p className="leading-relaxed text-night-petal">{message}</p>
    </div>
  )
}

function AssistantRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/majnu-mark.svg" alt="" width={24} height={24} className="mt-0.5 h-6 w-6 flex-none" />
      <div className="min-w-0 flex-1 text-[16px] leading-relaxed text-night-petal/95">{children}</div>
    </div>
  )
}

export function ChatMessages({
  items,
  streaming,
  status,
  onSend,
}: {
  items: ChatItem[]
  streaming: boolean
  status: string | null
  onSend: (text: string) => void
}) {
  const last = items.at(-1)
  // Show the moon while waiting for the first words, and whenever a tool runs.
  const waiting = streaming && (status !== null || last?.role !== "assistant" || last.text === "")

  return (
    <div role="log" aria-label="Conversation with Majnu" aria-busy={streaming} className="flex flex-col gap-6">
      {items.map((item) => {
        if (item.role === "user") {
          return (
            <div key={item.id} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-night-velvet px-4 py-2.5 text-[16px] leading-relaxed text-night-petal ring-1 ring-inset ring-night-petal/10">
                <span className="sr-only">You: </span>
                {item.text}
              </p>
            </div>
          )
        }
        if (item.role === "notice") {
          return (
            <div key={item.id} className="pl-9">
              <Notice tone={item.tone} message={item.message} reason={item.reason} />
            </div>
          )
        }
        return (
          <AssistantRow key={item.id}>
            <span className="sr-only">Majnu: </span>
            {item.text && <RichText text={item.text} />}
            {item.templates && (
              <TemplateSuggestions ids={item.templates} disabled={streaming} onChoose={(name) => onSend(templateMessage(name))} />
            )}
            {item.gifts && <GiftIdeas ideas={item.gifts} />}
          </AssistantRow>
        )
      })}

      {waiting && (
        <div role="status" className="flex items-center gap-3 pl-0.5 text-sm text-night-lilac">
          <WaxingMoon size={20} className="text-night-rose" />
          {status ?? "Majnu is writing…"}
        </div>
      )}
    </div>
  )
}
