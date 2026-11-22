"use client"

// The "Personalisations" card at the top of the Purchases tab (issue #96):
// today's free designs on this connection, the member's own balance, and a
// quantity stepper (1 to 5) with "Buy" for personalisations in advance. Buying
// posts the quantity to POST /api/credits/checkout and goes to Stripe-hosted
// Checkout; the owner and the price are decided on the server.
import { useId, useState } from "react"
import Link from "next/link"
import { Minus, Plus } from "lucide-react"
import { focusRing, primaryButton } from "@/components/app/styles"
import { formatAmount, personalisations, type FreeDesigns } from "@/lib/billing/view"
import { TOP_UP_REFUND_TEXT, topUp, wrapper } from "@/lib/plans"

type Props = {
  account: "member" | "guest"
  credits: number | null
  freeDesigns: FreeDesigns | null
}

const stepButton = `flex h-11 w-11 items-center justify-center rounded-full bg-night-petal/[0.06] text-night-petal ring-1 ring-inset ring-night-petal/20 transition-colors duration-200 hover:bg-night-petal/10 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`

export function PersonalisationsCard({ account, credits, freeDesigns }: Props) {
  const [quantity, setQuantity] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const quantityId = useId()
  const total = formatAmount(quantity * wrapper.priceCents, wrapper.currency)

  async function buy() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      })
      const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
      if (response.ok && body.url) {
        window.location.assign(body.url)
        return
      }
      setError(body.error ?? "Something went wrong opening the payment page. Try again.")
    } catch {
      setError("We couldn't reach Majnu just now. Check your connection and try again.")
    }
    setBusy(false)
  }

  return (
    <section aria-labelledby="personalisations-title" className="mt-8 rounded-[24px] bg-night-velvet p-5 ring-1 ring-inset ring-night-petal/10 sm:p-6">
      <h2 id="personalisations-title" className="font-display text-[24px] leading-tight text-night-petal">
        Personalisations
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-night-plum/60 px-4 py-3 ring-1 ring-inset ring-night-petal/10">
          <dt className="text-[13px] text-night-lilac">Free today</dt>
          <dd className="mt-0.5 text-[17px] font-semibold text-night-petal">
            {freeDesigns ? (
              <>
                {freeDesigns.left} of {freeDesigns.perDay}
                <span className="block text-[12px] font-normal text-night-lilac">on this network</span>
              </>
            ) : (
              <span className="text-[15px] font-normal text-night-lilac">Not offered now</span>
            )}
          </dd>
        </div>
        <div className="rounded-2xl bg-night-plum/60 px-4 py-3 ring-1 ring-inset ring-night-petal/10">
          <dt className="text-[13px] text-night-lilac">Yours</dt>
          <dd className="mt-0.5 text-[17px] font-semibold text-night-petal">
            {credits ?? 0}
            <span className="block text-[12px] font-normal text-night-lilac">bought in advance</span>
          </dd>
        </div>
      </dl>

      {account === "guest" ? (
        <div className="mt-5">
          <p className="text-[15px] leading-relaxed text-night-lilac">
            Create a free account to buy personalisations in advance, {wrapper.price} each.
          </p>
          <Link href={`/signup?next=${encodeURIComponent("/dashboard/purchases")}`} className={`mt-4 w-full sm:w-auto ${primaryButton}`}>
            Create a free account
          </Link>
        </div>
      ) : (
        <div className="mt-5">
          <p className="text-[15px] leading-relaxed text-night-lilac">
            Buy personalised wrappers in advance, {wrapper.price} each, then use one on any gift without paying again.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={stepButton}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={busy || quantity <= 1}
                aria-label="One fewer"
                aria-controls={quantityId}
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <output id={quantityId} aria-live="polite" className="min-w-[8.5rem] text-center text-[16px] font-semibold tabular-nums text-night-petal">
                {personalisations(quantity)}
              </output>
              <button
                type="button"
                className={stepButton}
                onClick={() => setQuantity((q) => Math.min(topUp.maxQuantity, q + 1))}
                disabled={busy || quantity >= topUp.maxQuantity}
                aria-label="One more"
                aria-controls={quantityId}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <button type="button" onClick={buy} aria-disabled={busy} className={`w-full sm:w-auto ${primaryButton} aria-disabled:opacity-60`}>
              {busy ? "Opening the payment page…" : `Buy, ${total}`}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm leading-relaxed text-night-petal">
              {error}
            </p>
          )}
          <p className="mt-4 text-[12px] leading-relaxed text-night-lilac/80">
            Paid once through Stripe, VAT included. {TOP_UP_REFUND_TEXT}
          </p>
        </div>
      )}
    </section>
  )
}
