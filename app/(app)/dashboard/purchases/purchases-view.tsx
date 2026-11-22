import Link from "next/link"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { PageBackLink } from "@/components/app/page-back-link"
import { focusRing, pagePadding, primaryButton } from "@/components/app/styles"
import { PersonalisationsCard } from "@/components/wrapper/personalisations-card"
import { PurchaseStatusCard } from "@/components/wrapper/purchase-status"
import { isInProgress, personalisations, statusWords, type FreeDesigns, type PurchaseView, type TopUpView } from "@/lib/billing/view"
import { free, wrapper } from "@/lib/plans"

// Display-only message after a round trip to Stripe (?billing=processing, or
// a top-up the page just confirmed). It never changes a purchase, which is
// read from the database.
export type PurchasesNotice = "processing" | { kind: "topup"; quantity: number } | null

// One line of the list: a top-up or a design, newest first.
type Entry = { kind: "design"; at: string; purchase: PurchaseView } | { kind: "topup"; at: string; topUp: TopUpView }

function day(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(new Date(iso))
}

const receiptLink = `inline-flex items-center gap-1 rounded text-sm font-medium text-night-petal underline decoration-night-petal/30 underline-offset-4 ${focusRing}`

export function PurchasesView({
  purchases,
  topUps,
  account,
  credits,
  freeDesigns,
  focusId,
  notice,
}: {
  purchases: PurchaseView[]
  topUps: TopUpView[]
  account: "member" | "guest"
  credits: number | null
  freeDesigns: FreeDesigns | null
  focusId: string | null
  notice: PurchasesNotice
}) {
  // The purchase just paid for, or any design still on its way, gets the live status card.
  const live = purchases.filter((p) => p.id === focusId || isInProgress(p.status))
  const entries: Entry[] = [
    ...purchases.map((p): Entry => ({
      kind: "design",
      at: p.paidAt ?? p.createdAt,
      purchase: p,
    })),
    ...topUps.map((t): Entry => ({ kind: "topup", at: t.createdAt, topUp: t })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

  return (
    <div className={`max-w-3xl ${pagePadding}`}>
      <PageBackLink fallback="/dashboard/gifts" className="mb-3" />
      <h1 className="font-display text-[34px] leading-tight md:text-[40px]">Purchases</h1>
      <p className="mt-1 text-[17px] leading-relaxed text-night-lilac">
        Majnu is free. The one thing you can buy is a {wrapper.name.toLowerCase()}: a design made for one gift, {wrapper.price} once.
      </p>

      {notice !== null && notice !== "processing" && (
        <div role="status" className="mt-6 rounded-2xl bg-night-velvet p-4 ring-1 ring-inset ring-night-petal/15 sm:p-5">
          <p className="font-semibold text-night-petal">Thank you. {personalisations(notice.quantity)} added</p>
          <p className="mt-1 text-night-lilac">
            Open a gift and choose &ldquo;Make it unique&rdquo; to use one. Stripe emails your receipt.
          </p>
        </div>
      )}

      {notice === "processing" && (
        <div role="status" className="mt-6 rounded-2xl bg-night-velvet p-4 ring-1 ring-inset ring-night-petal/15 sm:p-5">
          <p className="font-semibold text-night-petal">Your payment is being confirmed</p>
          <p className="mt-1 text-night-lilac">Your design starts as soon as Stripe confirms it. This page shows it when you reload.</p>
        </div>
      )}

      <PersonalisationsCard account={account} credits={credits} freeDesigns={freeDesigns} />

      {live.length > 0 && (
        <div className="mt-8 space-y-3">
          {live.map((p) => (
            <PurchaseStatusCard key={p.id} purchase={p} refreshOnSettle />
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="mt-10 flex max-w-md flex-col items-start">
          <MoonPhase lit={0} size={40} className="text-night-lilac" />
          <h2 className="mt-6 font-display text-[28px] leading-tight">Nothing bought yet</h2>
          <p className="mt-3 text-[17px] leading-relaxed text-night-lilac">
            Everything else is free:{" "}
            {free.features
              .slice(0, 3)
              .map((f) => f.toLowerCase())
              .join(", ")}
            . When a gift deserves more, open it and choose &ldquo;{wrapper.cta}
            &rdquo;.
          </p>
          <Link href="/dashboard/gifts" className={`mt-8 ${primaryButton}`}>
            Go to my gifts <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <section aria-labelledby="purchases-list" className="mt-10">
          <h2 id="purchases-list" className="text-xs font-semibold uppercase tracking-[0.2em] text-night-lilac">
            All purchases
          </h2>
          <ul className="mt-3 divide-y divide-night-petal/10 border-y border-night-petal/10">
            {entries.map((entry) =>
              entry.kind === "topup" ? (
                <li
                  key={`topup-${entry.topUp.id}`}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-night-petal">Bought {personalisations(entry.topUp.quantity)}</p>
                    <p className="mt-1.5 text-[13px] text-night-lilac/80">
                      {day(entry.topUp.createdAt)} · {entry.topUp.amount}
                      {entry.topUp.refundedQuantity > 0 ? ` · ${entry.topUp.refundedQuantity} refunded` : ""}
                    </p>
                  </div>
                  {entry.topUp.receiptUrl && (
                    <div className="flex flex-none items-center sm:flex-col sm:items-end">
                      <a href={entry.topUp.receiptUrl} target="_blank" rel="noopener noreferrer" className={receiptLink}>
                        Receipt <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only">(opens Stripe in a new tab)</span>
                      </a>
                    </div>
                  )}
                </li>
              ) : (
                <DesignRow key={entry.purchase.id} p={entry.purchase} />
              ),
            )}
          </ul>
        </section>
      )}

      <p className="mt-8 text-sm leading-relaxed text-night-lilac/80">
        Prices include VAT and are paid once by card through Stripe, which emails your receipt. There is nothing to cancel. If a design
        cannot be made, you are refunded in full automatically, or get your personalisation back.
      </p>
    </div>
  )
}

// What paid for a design, in the list's words.
function paidWith(p: PurchaseView): string {
  if (p.freeWithCode) return "Code"
  return p.amount
}

function DesignRow({ p }: { p: PurchaseView }) {
  return (
    <li key={p.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="font-semibold text-night-petal">
          {wrapper.name}
          {p.giftTitle ? <span className="font-normal text-night-lilac"> · {p.giftTitle}</span> : null}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug text-night-lilac">{p.request}</p>
        <p className="mt-1.5 text-[13px] text-night-lilac/80">
          {day(p.paidAt ?? p.createdAt)} · {paidWith(p)}
          {p.status === "refunded" ? " · refunded" : ""}
        </p>
      </div>
      <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 sm:flex-col sm:items-end">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            p.status === "done" ? "bg-night-orchid/15 text-night-orchid" : "bg-night-petal/10 text-night-petal"
          }`}
        >
          {statusWords(p).label}
        </span>
        {p.status === "done" && p.giftUrl && (
          <a
            href={p.giftUrl}
            target="_blank"
            rel="noopener"
            className={`inline-flex items-center gap-1 rounded text-sm font-semibold text-night-rose ${focusRing}`}
          >
            Gift page <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
        {p.receiptUrl && (
          <a
            href={p.receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 rounded text-sm font-medium text-night-petal underline decoration-night-petal/30 underline-offset-4 ${focusRing}`}
          >
            Receipt <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">(opens Stripe in a new tab)</span>
          </a>
        )}
      </div>
    </li>
  )
}
