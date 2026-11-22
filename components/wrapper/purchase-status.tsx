"use client"

// A purchase's status while its design is made: polls GET /api/purchases/<id>
// every few seconds until the design is done (or refunded), then shows the
// link to the gift page. Used on the Purchases tab after Checkout and on the
// letter's preview. The page announces each change politely to screen readers.
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { focusRing } from "@/components/app/styles"
import { isInProgress, statusWords, type PurchaseView } from "@/lib/billing/view"

const POLL_MS = 4000
// A run is bounded at about seven minutes; stop asking after fifteen.
const GIVE_UP_MS = 15 * 60 * 1000

export function usePurchaseStatus(initial: PurchaseView): PurchaseView {
  const [purchase, setPurchase] = useState(initial)
  const watching = isInProgress(purchase.status) || purchase.status === "pending"

  useEffect(() => {
    if (!watching) return
    const started = Date.now()
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    async function poll() {
      if (stopped || Date.now() - started > GIVE_UP_MS) return
      try {
        const response = await fetch(`/api/purchases/${encodeURIComponent(initial.id)}`, { cache: "no-store" })
        if (response.ok && !stopped) {
          const next = (await response.json()) as PurchaseView
          setPurchase(next)
          if (!isInProgress(next.status) && next.status !== "pending") return
        }
      } catch {
        // Offline for a moment: try again on the next tick.
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS)
    }
    timer = setTimeout(poll, POLL_MS)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [initial.id, watching])

  return purchase
}

// `refreshOnSettle`: re-render the server page around the card once the
// design is done or refunded, so a list on the same page (the Purchases tab)
// shows the same status.
export function PurchaseStatusCard({
  purchase: initial,
  refreshOnSettle = false,
  className = "",
}: {
  purchase: PurchaseView
  refreshOnSettle?: boolean
  className?: string
}) {
  const purchase = usePurchaseStatus(initial)
  const router = useRouter()
  const firstStatus = useRef(initial.status)
  useEffect(() => {
    if (refreshOnSettle && purchase.status !== firstStatus.current && !isInProgress(purchase.status) && purchase.status !== "pending") {
      firstStatus.current = purchase.status
      router.refresh()
    }
  }, [purchase.status, refreshOnSettle, router])
  const words = statusWords(purchase)
  const busy = isInProgress(purchase.status) || purchase.status === "pending"
  const done = purchase.status === "done"

  return (
    <section
      aria-label="Your personalised wrapper"
      className={`rounded-[22px] bg-night-velvet p-4 text-night-petal ring-1 ring-inset ring-night-rose/30 sm:p-5 ${className}`}
    >
      <div className="flex items-start gap-3.5">
        <MoonPhase
          lit={done ? 1 : busy ? 0.55 : 0.22}
          size={28}
          className={`mt-0.5 flex-none text-night-rose ${busy ? "motion-safe:animate-[moon-breathe_2.4s_ease-in-out_infinite]" : ""}`}
        />
        <div className="min-w-0 flex-1" role="status" aria-live="polite">
          <p className="font-display text-xl leading-snug">{words.label}</p>
          <p className="mt-1 text-[14px] leading-relaxed text-night-lilac">{words.detail}</p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-[13px] leading-snug text-night-lilac/90">
        <span className="font-semibold text-night-lilac">You asked for:</span> {purchase.request}
      </p>
      {done && purchase.giftUrl && (
        <a
          href={purchase.giftUrl}
          target="_blank"
          rel="noopener"
          className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-night-rose px-5 py-3 text-[15px] font-semibold text-night-plum transition-colors duration-200 ease-calm hover:bg-[#F1C4A9] ${focusRing}`}
        >
          Open the gift page <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </section>
  )
}
