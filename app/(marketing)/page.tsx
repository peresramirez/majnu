import type { CSSProperties } from "react"
import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"
import { GiftScene } from "@/components/landing/gift-scene"
import { HeroFinder } from "@/components/landing/hero-finder"
import { PreviewLinks } from "@/components/landing/preview-links"
import { Reveal } from "@/components/landing/reveal"
import { SiteFooter } from "@/components/landing/site-footer"
import { MoonPhase } from "@/components/brand/moon-phase"
import { Wordmark } from "@/components/brand/wordmark"
import { firstName } from "@/components/letters/names"
import { TemplateCard } from "@/components/letters/template-card"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-night-rose"

const primaryButton = `inline-flex items-center justify-center gap-2 rounded-full bg-night-rose px-6 py-3.5 text-[15px] font-semibold text-night-plum transition-colors duration-200 ease-calm hover:bg-[#F1C4A9] ${focusRing}`

// The finder's three steps, told as the moon travels from Majnu to Layla.
const steps = [
  {
    lit: 0.22,
    title: "Tell Majnu who it is for",
    body: "Your mother, your girlfriend, a friend who just moved away. Majnu knows which country you are shopping in and guesses the rest from who they are to you. Correct anything it gets wrong.",
  },
  {
    lit: 0.55,
    title: "Choose from three gifts",
    body: "Majnu searches real shops and brings back three ideas with prices, and says which one it would pick. None of them right? Answer a few questions and it looks again.",
  },
  {
    lit: 1,
    title: "Wrap it and send the link",
    body: "Majnu writes a page around the gift, in a design you choose. Send it by WhatsApp, email or QR code. They open it on their phone, with nothing to install.",
  },
]

// The demo links always resolve to the fixtures (lib/letters/store.ts), so the
// thumbnails and the pages they open show the same gift. They open in a dialog
// over this page (PreviewLinks), so a visitor never leaves the landing page.
const examples = [
  { slug: "demo-letter", templateId: "classic-envelope", name: `${firstName(letterFixtures["classic-envelope"].recipientName)}'s letter` },
  { slug: "demo-gift", templateId: "gift-reveal", name: `${firstName(letterFixtures["gift-reveal"].recipientName)}'s gift` },
  { slug: "demo-calendar", templateId: "advent-classic", name: `${firstName(calendarFixtures["advent-classic"].recipientName)}'s calendar` },
] as const

// Everything is free but one thing: a design Majnu makes for one gift. The
// copy lives here until lib/plans.ts describes the new model (docs/plan.md).
const freeFeatures = [
  "Find a gift: three ideas from shops in your country",
  "Personalise the search with a few questions",
  "Wrap it in one of our designs",
  "Share it by link, WhatsApp or QR code",
  "See when it is opened",
  "Advent calendars, with a free account",
]

const wrapperFeatures = [
  "A design Majnu makes for this one gift",
  "Made around the person and what you want to say",
  "Paid once, for one gift. No subscription",
]

const questions = [
  {
    q: "Do I need an account to find a gift?",
    a: "No. Majnu finds gifts and wraps one for you without signing in. Sign up when you want to keep your gifts on any device. Advent calendars are free too, but need an account.",
  },
  {
    q: "Where do the gift ideas come from?",
    a: "Majnu searches shops that sell in your country and links to each shop's own page. You buy the gift there, from the shop.",
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
    a: "Finding a gift, personalising the search, wrapping it in one of our designs, sending the link and seeing when it is opened are all free. A personalised wrapper, a design Majnu makes for one gift, costs €2.99 once.",
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
          <section
            aria-labelledby="hero-title"
            className="relative z-10 mx-auto flex max-w-6xl items-center px-5 pb-14 pt-24 sm:px-8 sm:pt-28 md:min-h-[100svh] md:pb-16 md:pt-28"
          >
            <HeroFinder />
          </section>

          <div className="relative z-10 px-5 pb-10 sm:px-8 md:hidden">
            <GiftScene variant="card" />
          </div>

          <section id="how" aria-labelledby="how-title" className="relative z-10 mx-auto max-w-6xl scroll-mt-8 px-5 pb-28 pt-10 sm:px-8 md:pb-32 md:pt-0">
            <h2 id="how-title" className="max-w-md font-display text-4xl leading-tight sm:text-5xl">How it works</h2>
            <p className="mt-4 max-w-md leading-relaxed text-night-lilac">
              In the old story, Majnu would have given Layla the moon. Finding something just as personal takes three steps.
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
                  <h3 className="font-display text-2xl text-night-petal">Free</h3>
                </div>
                <p className="mt-6">
                  <span className="font-display text-5xl">€0</span>
                </p>
                <p className="mt-2 text-night-lilac">Find a gift, wrap it in one of our designs, share it and see when it is opened.</p>
                <ul className="mt-8 flex-1 space-y-3 text-[15px]">
                  {freeFeatures.map((f) => (
                    <li key={f} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 flex-none text-night-rose" aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a href="#find" className={`mt-10 ${primaryButton}`}>
                  Find a gift <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
              <div className="flex flex-col rounded-3xl bg-night-velvet p-8 ring-1 ring-inset ring-night-petal/15">
                <div className="flex items-center gap-3 text-night-rose">
                  <MoonPhase lit={1} size={28} />
                  <h3 className="font-display text-2xl text-night-petal">Personalised wrapper</h3>
                </div>
                <p className="mt-6">
                  <span className="font-display text-5xl">€2.99</span>
                  <span className="ml-2 text-night-lilac">once, for one gift</span>
                </p>
                <p className="mt-2 text-night-lilac">Instead of one of our designs, Majnu makes a page for this gift alone.</p>
                <ul className="mt-8 flex-1 space-y-3 text-[15px]">
                  {wrapperFeatures.map((f) => (
                    <li key={f} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 flex-none text-night-rose" aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-10 text-sm leading-relaxed text-night-lilac">You only pay if you want one, for the gift you choose.</p>
              </div>
            </div>
            <p className="mt-6 text-center text-sm text-night-lilac/80">Prices in euros, paid once by card through Stripe. There is no subscription.</p>
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
