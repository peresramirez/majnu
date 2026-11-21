"use client"

// A gift as a card: title, price, description, the code with a copy button,
// and a link to redeem it. The code stays out of the page until the recipient
// asks for it (or has already unwrapped the gift).
import { useState } from "react"
import type { Gift } from "@/lib/letters/schema"
import { displayStyle, focusRing } from "./chrome"
import { CopyButton } from "./copy-button"
import { useLetter } from "./letter-context"
import { safeHttps } from "./urls"

export function GiftCard({
  gift,
  day,
  codeShown = false,
  eyebrow = "A gift for you",
  className = "",
}: {
  gift: Gift
  // The calendar door this gift sits behind, for tracking.
  day?: number
  // True when the recipient already unwrapped it, so the code shows at once.
  codeShown?: boolean
  eyebrow?: string
  className?: string
}) {
  const { track } = useLetter()
  const [showCode, setShowCode] = useState(codeShown)
  const url = safeHttps(gift.url)
  const image = safeHttps(gift.imageUrl)

  return (
    <article
      className={`overflow-hidden rounded-[22px] bg-[var(--paper)] text-[var(--paper-ink)] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.55)] ring-1 ring-[var(--line)] ${className}`}
    >
      <div
        className="relative isolate flex aspect-[1.7] flex-col justify-between overflow-hidden p-5 text-[var(--deep-ink)]"
        style={{
          background:
            "radial-gradient(90% 120% at 100% 0%, color-mix(in srgb, var(--accent-soft) 45%, transparent) 0%, transparent 60%), var(--deep)",
        }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          />
        ) : null}
        {image ? <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/60 via-black/10 to-transparent" /> : null}
        <span aria-hidden="true" className="gift-sheen pointer-events-none absolute inset-0" />
        <div className="flex items-start justify-between gap-3">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${image ? "text-white/90" : "opacity-80"}`}>{eyebrow}</p>
          {gift.price ? (
            <p
              className={`rounded-full px-2.5 py-1 text-sm font-semibold ${image ? "bg-black/35 text-white" : "bg-[color-mix(in_srgb,var(--deep-ink)_16%,transparent)]"}`}
            >
              {gift.price}
            </p>
          ) : null}
        </div>
        <h3 className={`text-balance text-[28px] leading-[1.08] ${image ? "text-white" : ""}`} style={displayStyle}>
          {gift.title}
        </h3>
      </div>

      <div className="space-y-4 p-5">
        {gift.description ? <p className="text-[15px] leading-relaxed text-[var(--paper-muted)]">{gift.description}</p> : null}

        {gift.code ? (
          showCode ? (
            <div className="gift-code-in rounded-2xl border border-dashed border-[var(--line)] bg-[color-mix(in_srgb,var(--paper-ink)_4%,transparent)] p-3">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--paper-muted)]">Your code</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <code className="select-all break-all px-1 font-mono text-[19px] font-semibold tracking-[0.12em]">{gift.code}</code>
                <CopyButton
                  text={gift.code}
                  label="Copy"
                  onCopied={() => track("gift_click", day)}
                  className={`shrink-0 rounded-full bg-[var(--paper-ink)] px-4 py-2 text-sm font-semibold text-[var(--paper)] transition-opacity duration-200 hover:opacity-90 ${focusRing}`}
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCode(true)}
              className={`w-full rounded-2xl border border-dashed border-[var(--line)] px-4 py-4 text-[15px] font-semibold transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--paper-ink)_5%,transparent)] ${focusRing}`}
            >
              Show the code
            </button>
          )
        ) : null}

        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("gift_click", day)}
            style={{ background: "var(--deep)" }}
            className={`flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[15px] font-semibold text-[var(--deep-ink)] transition-transform duration-200 ease-calm hover:-translate-y-px ${focusRing}`}
          >
            Redeem your gift
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4">
              <path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        ) : null}
      </div>

      <style>{`
        .gift-sheen { background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.28) 45%, transparent 60%); transform: translateX(-120%); }
        @media (prefers-reduced-motion: no-preference) {
          .gift-sheen { animation: gift-sheen 1600ms cubic-bezier(0.22, 0.61, 0.36, 1) 500ms 1 both; }
          .gift-code-in { animation: gift-code-in 420ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
        }
        @keyframes gift-sheen { to { transform: translateX(120%); } }
        @keyframes gift-code-in { from { opacity: 0; transform: translateY(6px); } }
      `}</style>
    </article>
  )
}

// Gifts tucked into a letter, invitation or postcard.
export function GiftList({ gifts, title = "Something for you" }: { gifts: Gift[]; title?: string }) {
  if (!gifts?.length) return null
  return (
    <section aria-label="Gifts" className="mx-auto mt-10 w-full max-w-[440px] space-y-5">
      <p className="text-center text-[12px] font-semibold uppercase tracking-[0.24em] text-[var(--page-muted)]">{title}</p>
      {gifts.map((g, i) => (
        <GiftCard key={i} gift={g} />
      ))}
    </section>
  )
}
