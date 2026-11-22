import type { CSSProperties } from "react"
import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"
import { GiftScene } from "@/components/landing/gift-scene"
import { HeroFinder } from "@/components/landing/hero-finder"
import { HowItWorks } from "@/components/landing/how-it-works"
import { PreviewLinks } from "@/components/landing/preview-links"
import { Reveal } from "@/components/landing/reveal"
import { SiteFooter } from "@/components/landing/site-footer"
import { MoonPhase } from "@/components/brand/moon-phase"
import { Wordmark } from "@/components/brand/wordmark"
import { firstName } from "@/components/letters/names"
import { TemplateCard } from "@/components/letters/template-card"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import { free, wrapper } from "@/lib/plans"

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-night-rose"

const primaryButton = `inline-flex items-center justify-center gap-2 rounded-full bg-night-rose px-6 py-3.5 text-[15px] font-semibold text-night-plum transition-colors duration-200 ease-calm hover:bg-[#F1C4A9] ${focusRing}`

// The demo links always resolve to the fixtures (lib/letters/store.ts), so the
// thumbnails and the pages they open show the same gift. They open in a dialog
// over this page (PreviewLinks), so a visitor never leaves the landing page.
const examples = [
  { slug: "demo-letter", templateId: "classic-envelope", name: `${firstName(letterFixtures["classic-envelope"].recipientName)}'s letter` },
  { slug: "demo-gift", templateId: "gift-reveal", name: `${firstName(letterFixtures["gift-reveal"].recipientName)}'s gift` },
  { slug: "demo-calendar", templateId: "advent-classic", name: `${firstName(calendarFixtures["advent-classic"].recipientName)}'s calendar` },
] as const

// Everything is free but one thing: a design Majnu makes for one gift. The
// pricing cards read their wording and price from lib/plans.ts.

const questions = [
  {
    q: "Do I need an account to find a gift?",
    a: "No. Majnu finds gifts and wraps one for you without signing in. Sign up when you want to keep your gifts on any device. Advent calendars are free too, but need an account.",
  },
  {
    q: "How does Majnu get to know them?",
    a: "From what you tell it, in words or by voice, and from what you choose to share: their public Instagram, TikTok or LinkedIn, a photo or a document. Majnu builds a short profile of the person from it, asks a few quick questions you answer with a tap, and searches with that.",
  },
  {
    q: "Where do the gift ideas come from?",
    a: "Majnu searches shops that sell in your country and shows you six ideas, each linked to the shop's own page. You buy the gift there, from the shop.",
  },
  {
    q: "How does Majnu know where I am?",
    a: "Only the country and region your connection comes from, as every website sees it, and your browser's language. Never your address or exact location.",
  },
  {
    q: "Does the person I send it to need an account?",
    a: "No. They open a link in their browser on any phone or computer. There is nothing to install.",
  },
  {
    q: "Who can see my gift?",
    a: "Only people who have the link. Gift pages are hidden from search engines, and link previews never show your message or gift codes.",
  },
  {
    q: "What does Majnu cost?",
    a: `Finding a gift, personalising the search, wrapping it in one of our designs, sending the link and seeing when it is opened are all free. A ${wrapper.name.toLowerCase()}, a design Majnu makes for one gift, costs ${wrapper.price} once, VAT included. Nothing renews and there is nothing to cancel.`,
  },
  {
    q: "What happens when I buy a personalised wrapper?",
    a: "On your wrapped gift, choose “Make it unique” and describe the look you want. Majnu starts on it as soon as you pay and it is ready in about two minutes, on the same link. If the design cannot be made, you are refunded in full automatically. You need a free account to buy one, so your receipt has a home.",
  },
]

export default function LandingPage() {
  return (
    <div data-surface="night" className="min-h-screen bg-night-plum text-night-petal">
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
        {/* Hero and how it works share one scene: as you scroll through the steps,
            Majnu's moon travels to Layla. On desktop it is pinned behind both; on
            phones How it works pins its own copy (components/landing/how-it-works.tsx).
            The glow is sized in pixels around the hero, so the tall How it works
            track below does not stretch it, and fades to plum like the next section. */}
        <div data-gift-track className="relative bg-night-plum bg-[radial-gradient(120%_1440px_at_72%_325px,#3E2759_0%,#1B1226_55%)]">
          <div className="hidden md:contents">
            <GiftScene variant="backdrop" />
          </div>

          {/* Pulled up over the pinned scene, so the scene scrolls away when this content ends. */}
          <div className="relative z-10 md:-mt-[100svh]">
          <section
            aria-labelledby="hero-title"
            className="relative z-10 mx-auto flex max-w-6xl items-center px-5 pb-14 pt-24 sm:px-8 sm:pt-28 md:min-h-[100svh] md:pb-16 md:pt-28"
          >
            <HeroFinder />
          </section>

          <HowItWorks />
          </div>
        </div>

        <section aria-labelledby="examples-title" className="bg-night-plum px-5 py-24 sm:px-8">
          <div className="mx-auto max-w-6xl">
            {/* Real examples: the demo pages a recipient would open, drawn as still thumbnails (no script). */}
            <Reveal>
              <div className="reveal-item max-w-xl">
                <h2 id="examples-title" className="font-display text-4xl leading-tight sm:text-5xl">Wrapped in a page made for them</h2>
                <p className="mt-4 leading-relaxed text-night-lilac">
                  The gift you choose arrives in a letter, a gift they unwrap with a tap, or a postcard. Open one the way they will, from a link on their phone.
                </p>
              </div>
            </Reveal>
            <PreviewLinks>
            <ul className="mt-10 grid gap-4 md:grid-cols-3 md:gap-5">
              {examples.map((example, i) => (
                <li key={example.slug} style={{ "--i": i } as CSSProperties}>
                  <Reveal className="h-full">
                    {/* A plain link (Next's <Link> would prefetch three dynamic pages), opened in a dialog. */}
                    <a href={`/l/${example.slug}`} data-preview={example.name} className={`reveal-item group block h-full rounded-3xl ${focusRing}`}>
                      <TemplateCard
                        id={example.templateId}
                        orientation="responsive"
                        className="h-full transition-shadow duration-500 ease-calm group-hover:ring-night-rose/40"
                      >
                        <span className="mt-3 inline-flex items-center gap-2 text-[15px] font-semibold text-night-rose">
                          Open {example.name}
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
            </PreviewLinks>
          </div>
        </section>

        <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-8 bg-night-deep px-5 py-24 sm:px-8">
          <div className="mx-auto max-w-4xl">
            <h2 id="pricing-title" className="text-center font-display text-4xl leading-tight sm:text-5xl">Free to find and send</h2>
            <p className="mx-auto mt-4 max-w-md text-center text-night-lilac">
              Finding, wrapping and sending a gift cost nothing. Pay only for a design made for one gift.
            </p>
            <div className="mt-12 grid gap-5 md:grid-cols-2">
              <div className="flex flex-col rounded-3xl bg-night-plum p-8 ring-1 ring-inset ring-night-petal/15">
                <div className="flex items-center gap-3 text-night-rose">
                  <MoonPhase lit={0.22} size={28} />
                  <h3 className="font-display text-2xl text-night-petal">{free.name}</h3>
                </div>
                <p className="mt-6">
                  <span className="font-display text-5xl">{free.price}</span>
                </p>
                <p className="mt-2 text-night-lilac">{free.summary}</p>
                <ul className="mt-8 flex-1 space-y-3 text-[15px]">
                  {free.features.map((f) => (
                    <li key={f} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 flex-none text-night-rose" aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a href="#find" className={`mt-10 ${primaryButton}`}>
                  {free.cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
              <div className="flex flex-col rounded-3xl bg-night-velvet p-8 ring-1 ring-inset ring-night-petal/15">
                <div className="flex items-center gap-3 text-night-rose">
                  <MoonPhase lit={1} size={28} />
                  <h3 className="font-display text-2xl text-night-petal">{wrapper.name}</h3>
                </div>
                <p className="mt-6">
                  <span className="font-display text-5xl">{wrapper.price}</span>
                  <span className="ml-2 text-night-lilac">{wrapper.period}</span>
                </p>
                <p className="mt-2 text-night-lilac">{wrapper.summary}</p>
                <ul className="mt-8 flex-1 space-y-3 text-[15px]">
                  {wrapper.features.map((f) => (
                    <li key={f} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 flex-none text-night-rose" aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-10 text-sm leading-relaxed text-night-lilac">
                  You only pay if you want one, for the gift you choose: tap &ldquo;Make it unique&rdquo; once it is wrapped. Needs a free account.
                </p>
              </div>
            </div>
            <p className="mt-6 text-center text-sm text-night-lilac/80">Prices in euros including VAT, paid once through Stripe. Nothing renews.</p>
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
            <a href="#find" className={`mt-8 ${primaryButton}`}>
              Find a gift <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
