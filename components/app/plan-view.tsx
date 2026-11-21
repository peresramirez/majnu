import { Check } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import type { Profile } from "@/lib/letters/store"
import { plans } from "@/lib/plans"
import { pagePadding, primaryButton } from "./styles"

function renewsOn(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(new Date(iso))
}

// The Plan tab. `billing` is billingEnabled() from lib/limits.ts: while it is
// off, Full moon features are free for everyone and there is nothing to buy.
export function PlanView({ profile, billing }: { profile: Profile; billing: boolean }) {
  const onFullMoon = profile.plan === "full-moon"
  const current = onFullMoon ? plans.fullMoon : plans.free

  return (
    <div className={`max-w-4xl ${pagePadding}`}>
      <h1 className="font-display text-[34px] leading-tight md:text-[40px]">Plan</h1>
      <p className="mt-1 text-[17px] text-night-lilac">
        You&apos;re on {current.name}.
        {onFullMoon && profile.planRenewsAt ? ` It renews on ${renewsOn(profile.planRenewsAt)}.` : ""}
      </p>

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
          const isCurrent = plan.id === profile.plan
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
                // Stripe-hosted checkout starts on the server (docs/plan.md, Billing).
                <form action="/api/checkout" method="post" className="mt-8">
                  <button type="submit" className={`w-full ${primaryButton}`}>
                    {plans.fullMoon.cta}
                  </button>
                </form>
              )}
              {isFullMoon && billing && onFullMoon && (
                <p className="mt-8 text-sm leading-relaxed text-night-lilac">
                  To change or cancel, write to{" "}
                  <a href="mailto:hello@majnu.app" className="rounded font-semibold text-night-petal underline underline-offset-4">
                    hello@majnu.app
                  </a>
                  . Full moon stays on until the end of the month you paid for.
                </p>
              )}
              {isFullMoon && !billing && <p className="mt-8 text-sm font-semibold text-night-rose">Included for you during early access</p>}
            </section>
          )
        })}
      </div>

      {billing && <p className="mt-6 text-sm text-night-lilac/80">Prices in euros. Paid securely by card through Stripe. Cancel anytime.</p>}
    </div>
  )
}
