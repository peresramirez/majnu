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
  researches: 45,
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
    "Six real gifts for your person in 3 seconds",
    "No app, no account to start",
  ]
  const value = [
    "Majnu builds their gift persona: who they are and what they love, from a few taps, their socials or photos",
    "Six gifts researched for that persona in real shops: one picked, and why",
    "Plus: wrap it in a page made for them, and see when they open it",
  ]
  return (
    <div className="pd-canvas pd-sky">
      <div className="pd-pad sp-product">
        <div className="sp-col">
          <Tag n={1} word="Product" />
          <h2 className="pd-title sp-title pd-in" style={at(1)}>
            Find <span className="pd-rose">the right gift</span> for one person.
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
            <img src="/pitch/step-1-tell.webp" alt="Majnu's message box: a birthday gift for my sister Lena, who climbs every weekend and loves old films" />
          </div>
          <div className="pd-phone sp-phone sp-phone--front">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pitch/step-2-gifts.webp" alt="Gift ideas with photos, shops and prices; a bouldering card is recommended" />
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

// Where the €150 went, as the developer reported it on 22 November. Dollar
// amounts are shown as paid and converted at about €0.86 for the bar.
const BUDGET = [
  { name: "Ads", paid: "€10", euros: 10 },
  { name: "Claude API", paid: "$20", euros: 17 },
  { name: "Bright Data", paid: "$30", euros: 26 },
  { name: "Daytona", paid: "$20", euros: 17 },
  { name: "Domain", paid: "$10", euros: 9 },
  { name: "Cloudflare", paid: "$5", euros: 4 },
]
const BUDGET_TOTAL = 150
const spent = BUDGET.reduce((sum, item) => sum + item.euros, 0)
const giftPot = BUDGET_TOTAL - spent

function euros(value: number): string {
  return value.toFixed(2)
}

function Market() {
  const channels = [
    {
      name: "Social, with €10 of ads",
      detail: "TikTok, Instagram and X from day one: five post designs, three reels and a 6-second ad, made with our own tools.",
    },
    {
      name: "In the room",
      detail: "A poster with a QR code and LAYLA100: a free personalised wrapper for the first 100 people.",
    },
    {
      name: "Built into the product",
      detail: "Every gift sent is a link. The person who opens it meets Majnu, and can send one back.",
    },
  ]
  return (
    <div className="pd-canvas pd-sky">
      <div className="pd-pad sp-market">
        <Tag n={2} word="Market" />
        <h2 className="pd-title sp-title pd-in" style={at(1)}>
          €10 of ads. <span className="pd-rose">Every gift is the next ad.</span>
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
          <div className="sp-budget-main">
            <p className="sp-budget-head">
              Our €150: <strong>≈ €{spent} spent</strong>, ≈ €{giftPot} for one real gift, drawn among our first 100 users
            </p>
            <ul className="sp-bar" aria-label="How the €150 is used">
              {BUDGET.map((item) => (
                <li key={item.name} className="sp-bar-part" style={{ flexGrow: item.euros }}>
                  <span className="sp-bar-fill" aria-hidden="true" />
                  <span className="sp-bar-name">{item.name}</span>
                  <span className="sp-bar-paid">{item.paid}</span>
                </li>
              ))}
              <li className="sp-bar-part sp-bar-part--gift" style={{ flexGrow: giftPot }}>
                <span className="sp-bar-fill" aria-hidden="true" />
                <span className="sp-bar-name">The giveaway gift</span>
                <span className="sp-bar-paid">≈ €{giftPot}</span>
              </li>
            </ul>
          </div>
          <p className="sp-budget-big">
            €{euros(spent / SNAPSHOT.people)}
            <span>per person, all costs in</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function Fit() {
  const stats = [
    { value: String(SNAPSHOT.searches), label: "gift searches", detail: `${SNAPSHOT.researches} shop researches behind them` },
    { value: String(SNAPSHOT.wrapped), label: "gifts sent", detail: "each wrapped for one person" },
    { value: `${openRate}%`, label: "opened", detail: `${SNAPSHOT.opened} of ${SNAPSHOT.wrapped} reached their person` },
    { value: `€${costPerGift}`, label: "AI cost per gift", detail: `a personalised wrapper sells for ${wrapper.price}` },
  ]
  return (
    <div className="pd-canvas pd-sky">
      <div className="pd-pad sp-fit">
        <Tag n={3} word="Fit" />
        <h2 className="pd-title sp-title pd-in" style={at(1)}>
          Our daily run: <span className="pd-rose">the right gift found, sent and opened.</span>
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
        "About 50 seconds. Majnu finds the right gift for one person. Effort: you type one line, say it, or paste their Instagram, and in three seconds you see six real gifts for your person, no account needed. Value: tap Personalise and Majnu builds a gift persona of them, who they are and what they love, from a few taps, their Instagram or LinkedIn, or a photo. Then it researches real shops for that persona and brings back six gifts, with the one it would pick and why. And as a plus, it wraps your gift in a page made for them, with your note and your voice, and you see when they open it. (Click Watch the app if there is time.)",
      content: <Product />,
    },
    {
      id: "market",
      label: "Market",
      notes:
        "About 50 seconds. We reached people three ways. On TikTok, Instagram and X from day one, with five designs, three reels and a 6-second ad we made ourselves, and only €10 of paid ads. Here in the room, the poster's QR code gives the first 100 people a free personalised wrapper with LAYLA100. And the product markets itself: every gift sent is a link, and the person who opens it meets Majnu. Of our €150 we spent about €83: €10 ads, $20 Claude, $30 Bright Data for reading profiles, $20 Daytona so the first customers get their personalised designs free, $10 domain and $5 Cloudflare. The other €67 buys one real gift, drawn among our first 100 users. That is about €3 per person so far, everything included.",
      content: <Market />,
    },
    {
      id: "fit",
      label: "Fit",
      notes:
        "About 50 seconds. Our metric is our daily run: the right gift found, sent and opened. In our first 21 hours, 26 people started 30 gift searches, with 45 shop researches behind them. 24 gifts were sent, and two out of three were opened by the person they were for. And the AI behind a gift costs about 42 cents, while a personalised wrapper sells for €2.99. Every opened gift brings someone new to Majnu: that is where product and marketing fit. Scan the code and find your next gift today.",
      content: <Fit />,
    },
  ]
}
