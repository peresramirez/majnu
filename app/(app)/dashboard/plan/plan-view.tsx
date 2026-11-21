import { Check } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { pagePadding, primaryButton, secondaryButton } from "@/components/app/styles"
import { plans } from "@/lib/plans"

// The Plan tab. Moved here from components/app/plan-view.tsx with the billing
// work (issue #14), which added the customer portal button, the "ends on" state
// for a scheduled cancellation and the notices after Checkout.

export type PlanDetails = {
  plan: "free" | "full-moon"
  planRenewsAt: string | null
  // Set when the subscriber cancelled: Full moon stays on until then.
  planCancelAt: string | null
  // There is a Stripe subscription to manage in the customer portal.
  hasSubscription: boolean
}

// Display-only messages after a round trip to Stripe (?billing=...). They
// never change the plan, which is read from the database.
export type PlanNotice = "error" | "pending" | null

function dayAndMonth(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Europe/Berlin" }).format(new Date(iso))
}

const NOTICES: Record<Exclude<PlanNotice, null>, { title: string; body: string }> = {
  error: {
    title: "We couldn't reach Stripe just now",
    body: "Nothing was charged. Try again in a moment.",
  },
  pending: {
    title: "Your payment is being confirmed",
    body: "Full moon turns on as soon as Stripe confirms it. This page shows it when you reload.",
  },
}

// `billing` is billingEnabled() from lib/limits.ts: while it is off, Full moon
// features are free for everyone and there is nothing to buy.
export function PlanView({ details, billing, notice }: { details: PlanDetails; billing: boolean; notice: PlanNotice }) {
  const onFullMoon = details.plan === "full-moon"
  const current = onFullMoon ? plans.fullMoon : plans.free
  const endsAt = onFullMoon ? details.planCancelAt : null
  // Whoever pays can always manage or cancel, even if billing is switched off later.
  const canManage = onFullMoon && (billing || details.hasSubscription)

  let status = ""
  if (endsAt) status = ` It ends on ${dayAndMonth(endsAt)} and won't renew.`
  else if (onFullMoon && details.planRenewsAt) status = ` It renews on ${dayAndMonth(details.planRenewsAt)}.`

  return (
    <div className={`max-w-4xl ${pagePadding}`}>
      <h1 className="font-display text-[34px] leading-tight md:text-[40px]">Plan</h1>
      <p className="mt-1 text-[17px] text-night-lilac">
        You&apos;re on {current.name}.{status}
      </p>

      {notice && (
        <div role="status" className="mt-6 rounded-2xl bg-night-velvet p-4 ring-1 ring-inset ring-night-petal/15 sm:p-5">
          <p className="font-semibold text-night-petal">{NOTICES[notice].title}</p>
          <p className="mt-1 text-night-lilac">{NOTICES[notice].body}</p>
        </div>
      )}

      {!billing && (
        <div className="mt-8 flex gap-4 rounded-3xl bg-night-velvet p-5 ring-1 ring-inset ring-night-rose/35 sm:p-6">
          <MoonPhase lit={1} size={30} className="flex-none text-night-rose" />
          <div>
            <p className="font-display text-xl leading-snug text-night-petal">Full moon is free during early access</p>
            <p className="mt-2 leading-relaxed text-night-lilac">
              Advent calendars and gift research are open to everyone while Majnu is new, so there is nothing to pay.
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {[plans.free, plans.fullMoon].map((plan) => {
          const isCurrent = plan.id === details.plan
          const isFullMoon = plan.id === "full-moon"
          return (
            <section
              key={plan.id}
              aria-labelledby={`plan-${plan.id}`}
              className={`flex flex-col rounded-3xl p-6 sm:p-7 ${
                isFullMoon ? "bg-night-velvet ring-1 ring-inset ring-night-petal/15" : "ring-1 ring-inset ring-night-petal/10"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-night-rose">
                  <MoonPhase lit={isFullMoon ? 1 : 0.22} size={26} />
                  <h2 id={`plan-${plan.id}`} className="font-display text-2xl text-night-petal">
                    {plan.name}
                  </h2>
                </div>
                {isCurrent && (
                  <span className="rounded-full bg-night-orchid/15 px-2.5 py-1 text-xs font-semibold text-night-orchid">Your plan</span>
                )}
              </div>
              <p className="mt-5">
                <span className="font-display text-4xl">{plan.price}</span>
                {plan.period && <span className="ml-2 text-night-lilac">{plan.period}</span>}
              </p>
              <p className="mt-1 text-night-lilac">{plan.summary}</p>
              <ul className="mt-6 flex-1 space-y-2.5 text-[15px]">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-3">
                    <Check className="mt-0.5 h-4 w-4 flex-none text-night-rose" aria-hidden="true" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {isFullMoon && billing && !onFullMoon && (
                // Stripe-hosted Checkout starts on the server (docs/plan.md, Billing).
                <form action="/api/checkout" method="post" className="mt-8">
                  <button type="submit" className={`w-full ${primaryButton}`}>
                    {plans.fullMoon.cta}
                  </button>
                </form>
              )}
              {isFullMoon && canManage && (
                <div className="mt-8">
                  {/* The Stripe customer portal: cancel, resume or change the card. */}
                  <form action="/api/billing/portal" method="post">
                    <button type="submit" className={`w-full ${secondaryButton}`}>
                      Manage or cancel
                    </button>
                  </form>
                  <p className="mt-3 text-sm leading-relaxed text-night-lilac">
                    {endsAt
                      ? "Changed your mind? You can keep Full moon from the same place."
                      : "If you cancel, Full moon stays on until the end of the month you paid for."}
                  </p>
                </div>
              )}
              {isFullMoon && !billing && !canManage && (
                <p className="mt-8 text-sm font-semibold text-night-rose">Included for you during early access</p>
              )}
            </section>
          )
        })}
      </div>

      {billing && <p className="mt-6 text-sm text-night-lilac/80">Prices in euros. Paid securely by card through Stripe. Cancel anytime.</p>}
    </div>
  )
}
