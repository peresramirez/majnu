// The short pitch at /short-pitch: three slides for the Layla hackathon's
// semifinal (2:30, one presenter): Product, Market, Fit. Public on purpose,
// so the judges can open the link that is sent with it; /pitch keeps the long
// deck behind its password.
//
// Every size is in pixels of a 1920 × 1080 canvas (deck.css). The numbers on
// the Fit slide were read from production on 22 November at 14:30 CET; update
// SNAPSHOT when they are read again.
import "server-only"
import type { CSSProperties } from "react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { SOCIAL_ACCOUNTS, SocialIcon } from "@/components/brand/social-links"
import { wrapper } from "@/lib/plans"
import type { DeckSlide } from "./deck"
import { QrCode } from "./qr-code"
import { VideoPopup } from "./video-popup"

const at = (i: number) => ({ "--i": i }) as CSSProperties

// Production, 22 November 2026, 14:30 CET: about 21 hours after launch.
const SNAPSHOT = {
  people: 26,
  accounts: 11,
  searches: 30,
  wrapped: 24,
  opened: 16,
  clicks: 6,
  aiEuros: 10.2, // $11.78 of Claude across 270 calls
  aiCalls: 270,
}
const openRate = Math.round((SNAPSHOT.opened / SNAPSHOT.wrapped) * 100)
const costPerGift = (SNAPSHOT.aiEuros / SNAPSHOT.wrapped).toFixed(2)

function Tag({ n, word }: { n: number; word: string }) {
  return (
    <p className="sp-tag pd-in" style={at(0)}>
      <span className="sp-tag-num">Slide {n}</span>
      <span className="sp-tag-word">
        {word}
        <span className="pd-rose">.</span>
      </span>
      <span className="sp-moon" aria-hidden="true">
        <MoonPhase lit={n / 3} size={28} />
      </span>
    </p>
  )
}

function Product() {
  const effort = [
    "Type one line, say it, or paste their Instagram",
    "Six real gifts from shops in your country in 3 seconds",
    "No app, no account to start",
  ]
  const value = [
    "A few taps build a profile of the person, and Majnu searches gifts for them",
    "Wrapped in a page with your note, the gift code and your voice",
    "Sent by link, WhatsApp or QR, and you see when they open it",
  ]
  return (
    <div className="pd-canvas pd-sky">
      <div className="pd-pad sp-product">
        <div className="sp-col">
          <Tag n={1} word="Product" />
          <h2 className="pd-title sp-title pd-in" style={at(1)}>
            One sentence in. <span className="pd-rose">A gift made for them</span> out.
          </h2>
          <div className="sp-ev">
            <div className="pd-in" style={at(2)}>
              <h3 className="sp-ev-head">Little effort</h3>
              <ul className="sp-list">
                {effort.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="pd-in" style={at(3)}>
              <h3 className="sp-ev-head sp-ev-head--rose">Much value</h3>
              <ul className="sp-list">
                {value.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="sp-phones pd-in" style={at(4)}>
          <div className="pd-phone sp-phone">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pitch/step-2-gifts.webp" alt="Six gift ideas with photos, shops and prices; one is recommended" />
          </div>
          <div className="pd-phone sp-phone sp-phone--front">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pitch/step-3-wrap.webp" alt="The gift page the recipient opens, with the gift and a note" />
          </div>
          <VideoPopup
            src="/pitch/majnu-app-demo.mp4"
            poster="/pitch/majnu-app-demo-poster.jpg"
            label="Watch the app"
            length="36 s"
            closeLabel="Close the video"
          />
        </div>
      </div>
    </div>
  )
}

function Market() {
  const channels = [
    {
      name: "Organic social",
      detail: "TikTok, Instagram and X from day one: five post designs, three reels and a 6-second ad, made with our own tools.",
    },
    {
      name: "In the room",
      detail: "A poster with a QR code and LAYLA100: a free personalised wrapper for the first 100 people.",
    },
    {
      name: "Built into the product",
      detail: "Every gift sent is a link. The person who opens it meets Majnu, and wants to send one back.",
    },
  ]
  return (
    <div className="pd-canvas pd-sky">
      <div className="pd-pad sp-market">
        <Tag n={2} word="Market" />
        <h2 className="pd-title sp-title pd-in" style={at(1)}>
          No ads. <span className="pd-rose">Every gift is the ad.</span>
        </h2>
        <ul className="pd-trio sp-trio">
          {channels.map((channel, i) => (
            <li key={channel.name} className="pd-card sp-card pd-in" style={at(i + 2)}>
              <h3>{channel.name}</h3>
              <p>{channel.detail}</p>
            </li>
          ))}
        </ul>
        <div className="sp-budget pd-in" style={at(5)}>
          <p className="sp-budget-big">
            €0 <span>on paid ads</span>
          </p>
          <p className="sp-budget-detail">
            The €150 goes into the product people touch: AI ≈ €{Math.round(SNAPSHOT.aiEuros)} for {SNAPSHOT.aiCalls} model calls, hosting €5, images under €1. The rest
            buys the launch giveaway: a real gift for one of our first 100 accounts.
          </p>
        </div>
      </div>
    </div>
  )
}

function Fit() {
  const stats = [
    { value: String(SNAPSHOT.wrapped), label: "gifts wrapped", detail: `from ${SNAPSHOT.searches} searches` },
    { value: `${openRate}%`, label: "opened", detail: `${SNAPSHOT.opened} of ${SNAPSHOT.wrapped} reached their person` },
    { value: "3 s", label: "to six ideas", detail: "the first answer needs no AI call" },
    { value: `€${costPerGift}`, label: "AI cost per gift", detail: `a personalised wrapper sells for ${wrapper.price}` },
  ]
  return (
    <div className="pd-canvas pd-sky">
      <div className="pd-pad sp-fit">
        <Tag n={3} word="Fit" />
        <h2 className="pd-title sp-title pd-in" style={at(1)}>
          Our daily run: <span className="pd-rose">gifts wrapped and opened.</span>
        </h2>
        <ul className="sp-stats">
          {stats.map((stat, i) => (
            <li key={stat.label} className="sp-stat pd-in" style={at(i + 2)}>
              <span className="sp-stat-value">{stat.value}</span>
              <span className="sp-stat-label">{stat.label}</span>
              <span className="sp-stat-detail">{stat.detail}</span>
            </li>
          ))}
        </ul>
        <div className="sp-fit-foot pd-in" style={at(6)}>
          <p className="sp-fit-line">
            In our first 21 hours: <strong>{SNAPSHOT.people} people</strong>, {SNAPSHOT.accounts} accounts, {SNAPSHOT.clicks} clicks through to shops. Every
            opened gift introduces Majnu to someone new: that is where product and marketing meet.
          </p>
          <div className="sp-try">
            <a className="pd-qr sp-qr" href="https://majnu.app" aria-label="Open majnu.app">
              <QrCode text="https://majnu.app" label="QR code for majnu.app" />
            </a>
            <div>
              <p className="sp-try-url">majnu.app</p>
              <ul className="pd-socials sp-socials">
                {SOCIAL_ACCOUNTS.map(({ platform, handle, href, path }) => (
                  <li key={platform}>
                    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Majnu on ${platform}, ${handle}`}>
                      <SocialIcon path={path} className="pd-social-icon" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function shortPitchSlides(): DeckSlide[] {
  return [
    {
      id: "product",
      label: "Product",
      notes:
        "About 50 seconds. Majnu turns one sentence into a gift that feels made for one person. Effort: you type one line, say it, or paste their Instagram, and in three seconds you see six real gifts from shops in your country, no account needed. Value: tap Personalise, answer a few quick questions, and Majnu builds a profile and searches gifts for that person. You choose one, it is wrapped in a page with your note, the gift code and your voice, you send the link, and you see when they open it. (Click Watch the app if there is time.)",
      content: <Product />,
    },
    {
      id: "market",
      label: "Market",
      notes:
        "About 50 seconds. We spent nothing on ads. We posted on TikTok, Instagram and X from day one with five designs, three reels and a 6-second ad we made ourselves. Here in the room, the poster's QR code gives the first 100 people a free personalised wrapper with LAYLA100. And the product markets itself: every gift sent is a link, and the person who opens it meets Majnu. The €150 went into the product: about €10 of AI for 270 calls, €5 hosting, under €1 of images, and the rest buys a real gift for one of our first 100 accounts.",
      content: <Market />,
    },
    {
      id: "fit",
      label: "Fit",
      notes:
        "About 50 seconds. Our metric is our daily run: gifts wrapped, and gifts opened. In our first 21 hours, 26 people used Majnu, 24 gifts were wrapped and two out of three were opened by the person they were for. The first ideas take three seconds, and the AI behind a gift costs about 42 cents, while a personalised wrapper sells for €2.99. Every opened gift brings someone new to Majnu: that is where product and marketing fit. Scan the code and send your first gift today.",
      content: <Fit />,
    },
  ]
}
