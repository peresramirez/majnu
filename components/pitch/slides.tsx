// The pitch deck's slides (issue #76): eight for a two-minute pitch and one
// appendix for questions. Server only, on purpose: the slides' words are in no
// JavaScript bundle, so a browser gets them only in the page's HTML and RSC
// payload, which app/(pitch)/pitch/page.tsx sends only once the password is
// right. The deck controller (deck.tsx) receives them already rendered.
//
// Every size is in pixels of a 1920 × 1080 canvas (deck.css turns them into
// container units). Copy is cut from the developer's own words in the issue.
import "server-only"
import type { CSSProperties } from "react"
import { Fingerprint, Layers, Lightbulb } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { SOCIAL_ACCOUNTS, SocialIcon } from "@/components/brand/social-links"
// The limits and the price come from the code that applies them, so the
// slide stays true when they change.
import { FINDER_LIMITS as finder } from "@/lib/finder/limits"
import { wrapper } from "@/lib/plans"
import { PITCH_NOTES } from "@/lib/pitch/notes"
import type { DeckLabels, DeckSlide } from "./deck"
import { AgentsDiagram, SystemDiagram } from "./diagrams"
import { MoonPassage } from "./moon-passage"
import { QrCode } from "./qr-code"

// The order a slide's pieces arrive in, 160 ms apart (deck.css).
const at = (i: number) => ({ "--i": i }) as CSSProperties
// A piece that arrives after a fixed delay, for slower reveals.
const after = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties

// The moon in the top corner fills from slide to slide, as it does on the
// landing page while the story is told.
function Phase({ n }: { n: number }) {
  return (
    <span className="pd-phase" aria-hidden="true">
      <MoonPhase lit={n / 8} size={28} />
    </span>
  )
}

function Cover() {
  return (
    <div className="pd-canvas pd-cover">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="pd-cover-art"
        src="/landing/majnu-layla-2048.webp"
        alt="A painting of Majnu giving Layla the moon on a desert dune at night"
        data-bleed=""
      />
      <div className="pd-cover-scrim" aria-hidden="true" data-bleed="" />
      <div className="pd-pad pd-cover-pad">
        <div className="pd-cover-text">
          <h1 className="pd-in" style={at(1)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pd-cover-wordmark" src="/brand/majnu-wordmark-on-dark.svg" alt="Majnu" />
          </h1>
          <p className="pd-cover-promise pd-in" style={at(3)}>
            The right gift,
            <br />
            wrapped for one person.
          </p>
        </div>
        <p className="pd-cover-url pd-in" style={at(5)}>
          majnu.app
        </p>
      </div>
    </div>
  )
}

function Wonder() {
  const questions = [
    { text: "What do I get someone who already has everything?", lit: 0.2, at: 700 },
    { text: "How do I make my gift feel more personal?", lit: 0.5, at: 2300 },
    { text: "How can I surprise someone with something they will truly remember?", lit: 0.8, at: 3900 },
  ]
  return (
    <div className="pd-canvas pd-sky">
      <Phase n={2} />
      <div className="pd-pad pd-wonder">
        <h2 className="pd-kicker pd-in" style={after(150)}>
          Have you ever wondered…?
        </h2>
        <ul className="pd-questions">
          {questions.map((q) => (
            <li key={q.text} className="pd-in" style={after(q.at)}>
              <span className="pd-q-moon" aria-hidden="true">
                <MoonPhase lit={q.lit} size={28} />
              </span>
              <span>{q.text}</span>
            </li>
          ))}
        </ul>
        <p className="pd-wonder-line pd-in" style={after(5800)}>
          <span className="pd-q-moon pd-q-moon--full" aria-hidden="true">
            <MoonPhase lit={1} size={28} />
          </span>
          <span>
            Gifting should be about <span className="pd-rose">creating memories</span>, not just buying presents.
          </span>
        </p>
      </div>
    </div>
  )
}

function Problem() {
  const frustrations = [
    { Icon: Lightbulb, name: "Inspiration", question: "What would they love?" },
    { Icon: Fingerprint, name: "Personalisation", question: "How do I make it theirs?" },
    { Icon: Layers, name: "Convenience", question: "Where do I find and organise it all?" },
  ]
  return (
    <div className="pd-canvas pd-sky">
      <Phase n={3} />
      <div className="pd-pad pd-problem">
        <h2 className="pd-title pd-in" style={at(0)}>
          Finding the perfect gift isn’t easy.
        </h2>
        <ul className="pd-trio">
          {frustrations.map(({ Icon, name, question }, i) => (
            <li key={name} className="pd-card pd-in" style={at(i + 2)}>
              <span className="pd-card-icon" aria-hidden="true">
                <Icon strokeWidth={1.25} />
              </span>
              <h3>{name}</h3>
              <p>{question}</p>
            </li>
          ))}
        </ul>
        <p className="pd-aside pd-in" style={at(6)}>
          So we often pick something ordinary, because it’s easier.
        </p>
      </div>
    </div>
  )
}

function Majnu() {
  const steps = [
    {
      title: "Tell Majnu about them",
      detail: "Words, socials, photos: Majnu builds a profile",
      src: "/pitch/step-1-tell.webp",
      alt: "Majnu's message box on a phone: a birthday gift for my sister Lena, who climbs every weekend and loves old films",
    },
    {
      title: "Six real gifts",
      detail: "A few taps, then real shops, one picked",
      src: "/pitch/step-2-gifts.webp",
      alt: "Gift ideas with photos, shops and prices; a bouldering card is recommended",
    },
    {
      title: "Wrapped for them",
      detail: "Names, the gift code, a voice note",
      src: "/pitch/step-3-wrap.webp",
      alt: "The gift page Lena opens: Happy birthday, Lena, with the bouldering card and a note from her brother",
    },
    {
      title: "Send the link",
      detail: "See when they open it",
      src: "/pitch/step-4-opened.webp",
      alt: "My gifts on a phone: the gift for Lena, opened just now",
    },
  ]
  return (
    <div className="pd-canvas pd-sky">
      <Phase n={4} />
      <div className="pd-pad pd-majnu">
        <h2 className="pd-title pd-in" style={at(0)}>
          Say who it’s for. <span className="pd-rose">Majnu does the rest.</span>
        </h2>
        <ol className="pd-steps">
          {steps.map((step, i) => (
            <li key={step.title} className="pd-step pd-in" style={at(i * 2 + 2)}>
              <div className="pd-step-head">
                <span className="pd-step-num" aria-hidden="true">
                  <MoonPhase lit={(i + 1) / 4} size={28} />
                </span>
                <h3>
                  <span className="pd-sr">Step {i + 1}: </span>
                  {step.title}
                </h3>
              </div>
              <p className="pd-step-detail">{step.detail}</p>
              <div className="pd-phone">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={step.src} alt={step.alt} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function MoreThanACard() {
  const opened = 9
  return (
    <div className="pd-canvas pd-sky">
      <Phase n={5} />
      <div className="pd-pad pd-more">
        <h2 className="pd-title pd-in" style={at(0)}>
          More than a card
        </h2>
        <div className="pd-more-grid">
          <section className="pd-panel pd-in" style={at(2)} aria-labelledby="pd-calendar-title">
            <p className="pd-tag">Available now</p>
            <h3 id="pd-calendar-title">Advent calendar</h3>
            <p className="pd-panel-lead">One gift, a surprise every day.</p>
            <ol className="pd-doors" aria-label="24 doors, the first nine filled">
              {Array.from({ length: 24 }, (_, n) => n + 1).map((day) => (
                <li
                  key={day}
                  className={day < opened ? "pd-door pd-door--filled" : day === opened ? "pd-door pd-door--today" : "pd-door"}
                >
                  <span className="pd-door-day">{day}</span>
                  {day <= opened && (
                    <span className="pd-door-moon" aria-hidden="true">
                      <MoonPhase lit={(day + 2) / 14} size={28} />
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <p className="pd-panel-note">Filled door by door with gifts Majnu found.</p>
          </section>
          <section className="pd-panel pd-panel--travel pd-in" style={at(4)} aria-labelledby="pd-travel-title">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pd-travel-art" src="/landing/majnu-layla-1280.webp" alt="" />
            <div className="pd-travel-scrim" aria-hidden="true" />
            <div className="pd-travel-body">
              <p className="pd-tag pd-tag--next">Coming next</p>
              <h3 id="pd-travel-title">Experiences and travel</h3>
              <ul className="pd-chips">
                <li>A weekend away</li>
                <li>A hotel stay</li>
                <li>An experience</li>
              </ul>
              <p className="pd-panel-note">Potentially through partners such as Expedia and Layla.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function Inside() {
  return (
    <div className="pd-canvas pd-sky">
      <Phase n={6} />
      <div className="pd-pad pd-inside">
        <h2 className="pd-title pd-in" style={at(0)}>
          How it works inside
        </h2>
        <div className="pd-diagram-wrap">
          <SystemDiagram />
        </div>
        <p className="pd-aside pd-in pd-in--fade" style={at(12)}>
          Next.js on Cloudflare Workers · Supabase Postgres with row-level security
        </p>
      </div>
    </div>
  )
}

function Model() {
  const plans = [
    {
      price: "€0",
      name: "No account needed",
      lines: [
        "Find, tailor, wrap and send.",
        `${finder.sessionsPerDay} sessions a day, ${finder.searchesPerSession} searches each.`,
      ],
    },
    { price: "€0", name: "Free account", lines: ["Keeps your gifts and the tracker."] },
    { price: `${wrapper.price} once`, name: "Personalised wrapper", lines: ["A one-of-a-kind design for one gift."], paid: true },
  ]
  return (
    <div className="pd-canvas pd-sky">
      <Phase n={7} />
      <div className="pd-pad pd-model">
        <h2 className="pd-title pd-in" style={at(0)}>
          Free to find and send
        </h2>
        <ul className="pd-plans">
          {plans.map((plan, i) => (
            <li key={plan.name} className={plan.paid ? "pd-plan pd-plan--paid pd-in" : "pd-plan pd-in"} style={at(i + 2)}>
              <p className="pd-plan-price">{plan.price}</p>
              <h3>{plan.name}</h3>
              {plan.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </li>
          ))}
        </ul>
        <div className="pd-vision pd-in" style={after(1900)}>
          <p className="pd-eyebrow">Our vision</p>
          <p className="pd-vision-line">Make thoughtful, personal gifts easy for everyone.</p>
        </div>
      </div>
    </div>
  )
}

// The last slide: the painting again, with the moon passing from Majnu's
// hands to Layla's (moon-passage.tsx), and the story of the name beside it.
function TheName() {
  return (
    <div className="pd-canvas pd-scene">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="pd-scene-art"
        src="/landing/majnu-layla-2048.webp"
        alt="Majnu giving Layla the moon, painted on a desert dune at night"
        data-bleed=""
      />
      <MoonPassage />
      <div className="pd-scene-scrim" aria-hidden="true" data-bleed="" />
      <div className="pd-pad pd-name">
        <div className="pd-name-text">
          <h2 className="pd-names pd-in" style={after(200)}>
            Majnu <span className="pd-plus">+</span> Layla
          </h2>
          <p className="pd-name-story pd-in" style={after(1000)}>
            In the old love story, Majnu wrote poems for Layla.
          </p>
          <p className="pd-name-line pd-in" style={after(2400)}>
            Layla plans the journey.
          </p>
          <p className="pd-name-line pd-in" style={after(4200)}>
            Majnu <span className="pd-rose">finds the gift.</span>
          </p>
        </div>
        <div className="pd-try pd-in" style={after(5200)}>
          <a className="pd-qr" href="https://majnu.app">
            <QrCode text="https://majnu.app" label="QR code for majnu.app" />
          </a>
          <div>
            <p className="pd-try-label">Scan to try it</p>
            <p className="pd-try-url">majnu.app</p>
            <ul className="pd-socials">
              {SOCIAL_ACCOUNTS.map(({ platform, handle, href, path }) => (
                <li key={platform}>
                  <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Majnu on ${platform}, ${handle}`}>
                    <SocialIcon path={path} className="pd-social-icon" />
                    <span>{handle}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="pd-thanks pd-in" style={after(6000)}>
          Thank you
        </p>
      </div>
    </div>
  )
}

function Appendix() {
  return (
    <div className="pd-canvas pd-sky">
      <div className="pd-pad pd-appendix">
        <p className="pd-eyebrow pd-in" style={at(0)}>
          Appendix
        </p>
        <h2 className="pd-title pd-title--small pd-in" style={at(0)}>
          The agents and the data
        </h2>
        <div className="pd-diagram-wrap">
          <AgentsDiagram />
        </div>
      </div>
    </div>
  )
}

// Appendix, after the questions slide: what we post at launch (issue: launch
// content). The files are the team's own, in public/pitch/social/; like every
// picture of the deck they are named only here, behind the password.
function LaunchFilm() {
  return (
    <div className="pd-canvas pd-sky">
      <div className="pd-pad pd-launch">
        <p className="pd-eyebrow pd-in" style={at(0)}>
          Appendix · Launch content
        </p>
        <h2 className="pd-title pd-title--small pd-in" style={at(0)}>
          The launch film
        </h2>
        <div className="pd-launch-stage pd-in" style={at(1)}>
          <div className="pd-launch-film">
            <video
              className="pd-launch-video"
              src="/pitch/social/03-app.mp4"
              poster="/pitch/social/03-app-cover.webp"
              controls
              muted
              playsInline
              preload="none"
              aria-label="The launch film: Majnu finding gifts for someone's mother and wrapping one"
            />
            <div className="pd-launch-caption">
              <p className="pd-launch-lead">The app, in 36 seconds.</p>
              <p>Cut for social, 16:9. Starts muted.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function LaunchPrint() {
  const pieces = [
    {
      src: "/pitch/social/poster.webp",
      caption: "The printed poster",
      alt: "Poster: Who is the gift for? Majnu giving Layla the moon, the code LAYLA100 for a free personalised wrapper for the first 100 people, and a QR code to majnu.app",
      shape: "pd-launch-piece--poster",
    },
    {
      src: "/pitch/social/01-who-is-it-for.webp",
      caption: "Post, 4:5",
      alt: "Social post: Who is the gift for? Tell Majnu, it finds six real gifts from real shops and wraps the one you choose",
      shape: "pd-launch-piece--post",
    },
    {
      src: "/pitch/social/02-three-steps.webp",
      caption: "Post, 16:9",
      alt: "Social post: three steps, one person in mind. Say who it is for, choose from six real gifts, send it as a link",
      shape: "pd-launch-piece--wide",
    },
  ]
  return (
    <div className="pd-canvas pd-sky">
      <div className="pd-pad pd-launch">
        <p className="pd-eyebrow pd-in" style={at(0)}>
          Appendix · Launch content
        </p>
        <h2 className="pd-title pd-title--small pd-in" style={at(0)}>
          The poster and the posts
        </h2>
        <ul className="pd-launch-pieces">
          {pieces.map((piece, i) => (
            <li key={piece.src} className={`pd-launch-piece ${piece.shape} pd-in`} style={at(i + 1)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={piece.src} alt={piece.alt} loading="lazy" />
              <p>{piece.caption}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// The deck controls' words. They live here, on the server, because the
// controller's bundle also loads with the password screen.
export const DECK_LABELS: DeckLabels = {
  hint: "Turn your phone sideways to present.",
  controls: "Slides",
  slide: "Slide",
  of: "of",
  notes: "Speaker notes",
  notesKey: "Speaker notes (N)",
  fullscreen: "Full screen (F)",
  leaveFullscreen: "Leave full screen (F)",
  time: "Time spent",
  restartClock: "Restart the clock",
  next: "Next",
  last: "Last slide",
  appendix: "Appendix",
}

export function pitchSlides(): DeckSlide[] {
  return [
    { id: "cover", label: "Majnu", content: <Cover /> },
    { id: "wonder", label: "Have you ever wondered", content: <Wonder /> },
    { id: "problem", label: "The problem", content: <Problem /> },
    { id: "majnu", label: "How Majnu works", content: <Majnu /> },
    { id: "more", label: "More than a card", content: <MoreThanACard /> },
    { id: "inside", label: "How it works inside", content: <Inside /> },
    { id: "model", label: "The model and the vision", content: <Model /> },
    { id: "name", label: "Majnu + Layla", content: <TheName /> },
    { id: "appendix", label: "Appendix: the agents and the data", content: <Appendix />, appendix: true },
    { id: "launch-film", label: "Appendix: the launch film", content: <LaunchFilm />, appendix: true },
    { id: "launch-print", label: "Appendix: the poster and the posts", content: <LaunchPrint />, appendix: true },
  ].map((slide) => ({ ...slide, notes: PITCH_NOTES[slide.id as keyof typeof PITCH_NOTES] }))
}
