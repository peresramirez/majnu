import type { CSSProperties } from "react"
import Link from "next/link"
import { ArrowRight, CalendarDays, Check, Gift, Mail, MapPin } from "lucide-react"
import { GiftScene } from "@/components/landing/gift-scene"
import { Reveal } from "@/components/landing/reveal"
import { SiteFooter } from "@/components/landing/site-footer"
import { MoonPhase } from "@/components/brand/moon-phase"
import { Wordmark } from "@/components/brand/wordmark"
import { firstName } from "@/components/letters/names"
import { TemplateCard } from "@/components/letters/template-card"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import { plans } from "@/lib/plans"

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-night-rose"

const primaryButton = `inline-flex items-center justify-center gap-2 rounded-full bg-night-rose px-6 py-3.5 text-[15px] font-semibold text-night-plum transition-colors duration-200 ease-calm hover:bg-[#F1C4A9] ${focusRing}`
const secondaryButton = `inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold text-night-petal ring-1 ring-inset ring-night-petal/25 transition-colors duration-200 ease-calm hover:ring-night-petal/50 ${focusRing}`

const steps = [
  {
    lit: 0.22,
    title: "Tell Majnu who it is for",
    body: "Your partner, your mum, a friend who just moved away. Answer a few questions in a chat, and Majnu helps you find the right words.",
  },
  {
    lit: 0.55,
    title: "Make it yours",
    body: "Choose a design, add a gift code, a date and a place, or a calendar of small surprises. Change anything until it feels like you.",
  },
  {
    lit: 1,
    title: "Send the link",
    body: "Share it by WhatsApp, email or QR code. They open it on their phone with nothing to install, and you see when they do.",
  },
]

// `motion` plays once as the card scrolls in; `hover` is the smaller echo on hover.
const kinds = [
  { icon: Gift, name: "Gift", body: "A gift card or code, wrapped in a page they unwrap with a tap.", plan: "Free", motion: "motion-gift", hover: "motion-safe:group-hover:-translate-y-1 motion-safe:group-hover:-rotate-6" },
  { icon: Mail, name: "Letter", body: "Your own words, for a birthday, a thank-you or no reason at all.", plan: "Free", motion: "motion-letter", hover: "motion-safe:group-hover:-rotate-[10deg]" },
  { icon: MapPin, name: "Invitation", body: "Date, place and a map your guests can open.", plan: "Free", motion: "motion-pin", hover: "motion-safe:group-hover:-translate-y-1" },
  { icon: CalendarDays, name: "Advent calendar", body: "One door a day, each with a note or a small gift.", plan: "Full moon", motion: "motion-calendar", hover: "motion-safe:group-hover:rotate-6" },
]

// The demo links always resolve to the fixtures (lib/letters/store.ts), so the
// thumbnails and the pages they open show the same gift.
const examples = [
  { slug: "demo-letter", templateId: "classic-envelope", cta: `Open ${firstName(letterFixtures["classic-envelope"].recipientName)}'s letter` },
  { slug: "demo-gift", templateId: "gift-reveal", cta: `Open ${firstName(letterFixtures["gift-reveal"].recipientName)}'s gift` },
  { slug: "demo-calendar", templateId: "advent-classic", cta: `Open ${firstName(calendarFixtures["advent-classic"].recipientName)}'s calendar` },
] as const

const questions = [
  {
    q: "Does the person I send it to need an account?",
    a: "No. They open a link in their browser on any phone or computer. There is nothing to install.",
  },
  {
    q: "Who can see my gift?",
    a: "Only people who have the link. Gift pages are hidden from search engines, and link previews never show your message or gift codes.",
  },
  {
    q: "Can I cancel Full moon?",
    a: "Yes, at any time from your account. It stays active until the end of the month you paid for, and you keep everything you made.",
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-night-plum text-night-petal">
      <header className="absolute inset-x-0 top-0 z-20">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8" aria-label="Main">
          <Link href="/" className={`rounded ${focusRing}`} aria-label="Majnu home">
            <Wordmark width={124} />
          </Link>
          <div className="flex items-center gap-1 text-sm font-medium sm:gap-2">
            <a href="#how" className={`hidden rounded-full px-3 py-2 text-night-lilac hover:text-night-petal sm:inline-block ${focusRing}`}>How it works</a>
            <a href="#pricing" className={`hidden rounded-full px-3 py-2 text-night-lilac hover:text-night-petal sm:inline-block ${focusRing}`}>Pricing</a>
            <Link href="/signin" className={`rounded-full px-4 py-2 ring-1 ring-inset ring-night-petal/25 hover:ring-night-petal/50 ${focusRing}`}>Sign in</Link>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero and how it works share one scene: as you scroll, Majnu's moon travels to Layla. */}
        <div data-gift-track className="relative bg-[radial-gradient(120%_80%_at_72%_18%,#3E2759_0%,#1B1226_55%,#100A17_100%)]">
          <div className="hidden md:contents">
            <GiftScene variant="backdrop" />
          </div>

          {/* Pulled up over the pinned scene, so the scene scrolls away when this content ends. */}
          <div className="relative z-10 md:-mt-[100svh]">
          <section className="relative z-10 mx-auto flex max-w-6xl items-center px-5 pb-12 pt-28 sm:px-8 md:min-h-[100svh] md:pb-20 md:pt-32">
            <div className="max-w-xl">
              <p className="mb-6 text-xs font-semibold uppercase tracking-[0.22em] text-night-lilac">Personalized digital gifting</p>
              <h1 className="font-display text-[clamp(46px,8vw,92px)] leading-[1.02] tracking-[-0.01em]">Give something personal.</h1>
              <p className="mt-6 max-w-md text-lg leading-relaxed text-night-lilac">
                Tell Majnu who it is for. It helps you find the words, wraps your gift in a page made just for them,
                and sends it as a link they can open tonight.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/signin" className={primaryButton}>
                  Create a gift <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <a href="#how" className={secondaryButton}>See how it works</a>
              </div>
              <p className="mt-6 text-sm text-night-lilac/80">Free to start. Nothing to install for the person you send it to.</p>
            </div>
          </section>

          <div className="relative z-10 px-5 pb-10 sm:px-8 md:hidden">
            <GiftScene variant="card" />
          </div>

          <section id="how" aria-labelledby="how-title" className="relative z-10 mx-auto max-w-6xl scroll-mt-8 px-5 pb-28 pt-10 sm:px-8 md:pb-32 md:pt-0">
            <h2 id="how-title" className="max-w-md font-display text-4xl leading-tight sm:text-5xl">How it works</h2>
            <p className="mt-4 max-w-md leading-relaxed text-night-lilac">
              In the old story, Majnu would have given Layla the moon. Giving something just as personal takes three steps.
            </p>
            <ol className="mt-12 space-y-5 md:mt-14 md:space-y-[22vh] md:pb-[18vh]">
              {steps.map((step, i) => (
                <li key={step.title} className="max-w-md rounded-3xl bg-night-velvet/80 p-7 ring-1 ring-inset ring-night-petal/10 backdrop-blur-sm">
                  <div className="flex items-center gap-3 text-night-rose">
                    <MoonPhase lit={step.lit} size={30} />
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-night-lilac">Step {i + 1}</span>
                  </div>
                  <h3 className="mt-4 font-display text-3xl leading-tight">{step.title}</h3>
                  <p className="mt-3 leading-relaxed text-night-lilac">{step.body}</p>
                </li>
              ))}
            </ol>
          </section>
          </div>
        </div>

        <section aria-labelledby="send-title" className="bg-night-plum px-5 py-24 sm:px-8">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <h2 id="send-title" className="reveal-item font-display text-4xl leading-tight sm:text-5xl">What you can send</h2>
            </Reveal>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {kinds.map(({ icon: Icon, name, body, plan, motion, hover }, i) => (
                <li key={name} style={{ "--i": i } as CSSProperties}>
                  <Reveal className="h-full">
                    <div className="reveal-item group relative flex h-full flex-col overflow-hidden rounded-3xl bg-night-velvet p-6 ring-1 ring-inset ring-night-petal/10 transition-shadow duration-500 ease-calm hover:ring-night-rose/30">
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-night-rose opacity-0 blur-3xl transition-opacity duration-700 ease-calm group-hover:opacity-[0.14]"
                      />
                      <div className="relative flex items-start justify-between">
                        <span className={`reveal-icon inline-block ${motion}`}>
                          <Icon className={`h-6 w-6 text-night-rose transition-transform duration-500 ease-calm ${hover}`} aria-hidden="true" />
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${plan === "Free" ? "bg-night-petal/10 text-night-lilac" : "bg-night-rose/15 text-night-rose"}`}>{plan}</span>
                      </div>
                      <h3 className="relative mt-8 font-display text-2xl">{name}</h3>
                      <p className="relative mt-2 text-[15px] leading-relaxed text-night-lilac">{body}</p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>

            {/* Real examples: the demo pages a recipient would open, drawn as still thumbnails (no script). */}
            <div className="mt-20 sm:mt-24">
              <Reveal>
                <div className="reveal-item max-w-xl">
                  <h3 className="font-display text-3xl leading-tight sm:text-4xl">Open a real one</h3>
                  <p className="mt-3 leading-relaxed text-night-lilac">
                    These are the pages Majnu makes. Open one the way the person you send it to will, from a link on their phone.
                  </p>
                </div>
              </Reveal>
              <ul className="mt-10 grid gap-4 md:grid-cols-3 md:gap-5">
                {examples.map((example, i) => (
                  <li key={example.slug} style={{ "--i": i } as CSSProperties}>
                    <Reveal className="h-full">
                      {/* A plain link: Next's <Link> would prefetch three dynamic pages for every visitor. */}
                      <a href={`/l/${example.slug}`} className={`reveal-item group block h-full rounded-3xl ${focusRing}`}>
                        <TemplateCard
                          id={example.templateId}
                          orientation="responsive"
                          className="h-full transition-shadow duration-500 ease-calm group-hover:ring-night-rose/40"
                        >
                          <span className="mt-3 inline-flex items-center gap-2 text-[15px] font-semibold text-night-rose">
                            {example.cta}
                            <ArrowRight
                              className="h-4 w-4 transition-transform duration-300 ease-calm motion-safe:group-hover:translate-x-1"
                              aria-hidden="true"
                            />
                          </span>
                        </TemplateCard>
                      </a>
                    </Reveal>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-8 bg-night-deep px-5 py-24 sm:px-8">
          <div className="mx-auto max-w-4xl">
            <h2 id="pricing-title" className="text-center font-display text-4xl leading-tight sm:text-5xl">Simple pricing</h2>
            <p className="mx-auto mt-4 max-w-md text-center text-night-lilac">Start free. Upgrade when you want calendars and help finding the gift.</p>
            <div className="mt-12 grid gap-5 md:grid-cols-2">
              {[plans.free, plans.fullMoon].map((plan) => {
                const highlighted = plan.id === "full-moon"
                return (
                  <div
                    key={plan.id}
                    className={`flex flex-col rounded-3xl p-8 ${highlighted ? "bg-night-velvet ring-2 ring-inset ring-night-rose" : "bg-night-plum ring-1 ring-inset ring-night-petal/15"}`}
                  >
                    <div className="flex items-center gap-3 text-night-rose">
                      <MoonPhase lit={highlighted ? 1 : 0.22} size={28} />
                      <h3 className="font-display text-2xl text-night-petal">{plan.name}</h3>
                    </div>
                    <p className="mt-6">
                      <span className="font-display text-5xl">{plan.price}</span>
                      {plan.period && <span className="ml-2 text-night-lilac">{plan.period}</span>}
                    </p>
                    <p className="mt-2 text-night-lilac">{plan.summary}</p>
                    <ul className="mt-8 flex-1 space-y-3 text-[15px]">
                      {plan.features.map((f) => (
                        <li key={f} className="flex gap-3">
                          <Check className="mt-0.5 h-4 w-4 flex-none text-night-rose" aria-hidden="true" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={highlighted ? "/signin?plan=full-moon" : "/signin"}
                      className={`mt-10 ${highlighted ? primaryButton : secondaryButton}`}
                    >
                      {plan.cta}
                    </Link>
                  </div>
                )
              })}
            </div>
            <p className="mt-6 text-center text-sm text-night-lilac/80">Prices in euros. Paid securely by card through Stripe. Cancel anytime.</p>
          </div>
        </section>

        <section aria-labelledby="faq-title" className="bg-night-plum px-5 py-24 sm:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 id="faq-title" className="font-display text-4xl leading-tight sm:text-5xl">Questions</h2>
            <div className="mt-10 divide-y divide-night-petal/10 border-y border-night-petal/10">
              {questions.map(({ q, a }) => (
                <details key={q} className="group py-5">
                  <summary className={`flex cursor-pointer list-none items-center justify-between gap-6 rounded text-lg font-medium ${focusRing}`}>
                    {q}
                    <span className="text-2xl leading-none text-night-rose transition-transform duration-200 ease-calm group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="mt-3 max-w-2xl leading-relaxed text-night-lilac">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[radial-gradient(90%_120%_at_50%_100%,#3E2759_0%,#1B1226_60%)] px-5 py-28 text-center sm:px-8">
          <div className="mx-auto flex max-w-2xl flex-col items-center">
            <MoonPhase lit={1} size={40} className="text-night-rose" />
            <h2 className="mt-6 font-display text-[clamp(40px,6vw,64px)] leading-tight">Who is yours for?</h2>
            <Link href="/signin" className={`mt-8 ${primaryButton}`}>
              Create a gift <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
