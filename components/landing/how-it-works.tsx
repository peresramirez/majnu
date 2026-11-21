import type { CSSProperties } from "react"
import { ArrowRight, BookOpen, Coffee, Flower2, Gift, Link2, MapPin, MessageCircle, QrCode, UserRound } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { steps, type StepVisual } from "@/components/landing/how-it-works-steps"
import { Reveal } from "@/components/landing/reveal"

// The landing page's "How it works": the three steps from how-it-works-steps.ts,
// each with its moon phase, a short title, one line and a small picture.

// The pieces of each picture arrive one after another once its card scrolls in.
// <Reveal> sets data-reveal on the group; it only ever hides anything when
// reduced motion is off, so with reduced motion everything is simply there.
// `--i` (the step) and `--d` (the piece) set the delay.
const arrive =
  "motion-safe:transition-[opacity,transform] motion-safe:duration-700 motion-safe:ease-calm [transition-delay:calc(var(--i,0)*90ms_+_var(--d,0ms))] group-data-[reveal=hidden]/step:translate-y-1.5 group-data-[reveal=hidden]/step:opacity-0"
const at = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties

const chip =
  "inline-flex h-6 items-center gap-1 rounded-full bg-night-velvet px-2 text-[11px] font-medium text-night-petal ring-1 ring-inset ring-night-petal/15"

// 1. A message to Majnu and what it assumed, as the finder shows them.
function Ask() {
  return (
    <div className="flex h-full flex-col justify-center gap-2.5">
      <p
        className={`self-end whitespace-nowrap rounded-[14px] rounded-br-[5px] bg-night-petal/10 px-3 py-1.5 text-[13px] text-night-petal ${arrive}`}
        style={at(250)}
      >
        A gift for my mother
      </p>
      <div className="flex flex-wrap gap-1.5">
        <span className={`${chip} ${arrive}`} style={at(700)}>
          <UserRound className="h-3 w-3 text-night-lilac" />
          About 45–70
        </span>
        <span className={`${chip} ${arrive}`} style={at(850)}>
          <MapPin className="h-3 w-3 text-night-lilac" />
          Germany
        </span>
      </div>
    </div>
  )
}

// 2. Three gifts with prices; the one Majnu recommends lifts and gets its badge.
const gifts = [
  { icon: Coffee, price: "€24" },
  { icon: Flower2, price: "€39", recommended: true },
  { icon: BookOpen, price: "€18" },
]

function Choose() {
  return (
    <div className="grid h-full grid-cols-3 items-end gap-2 pt-3">
      {gifts.map(({ icon: Icon, price, recommended }, i) => (
        <div
          key={price}
          className={`relative rounded-xl bg-night-velvet p-1.5 ring-1 ring-inset ${
            recommended ? "-translate-y-1 ring-night-petal/35" : "ring-night-petal/10"
          } ${arrive}`}
          style={at(250 + i * 120)}
        >
          {recommended && (
            <span
              className={`absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-night-orchid px-1.5 py-px text-[9px] font-semibold tracking-wide text-night-plum ${arrive}`}
              style={at(900)}
            >
              Recommended
            </span>
          )}
          <span className="grid h-7 place-items-center rounded-lg bg-gradient-to-br from-night-petal/[0.14] to-night-petal/[0.03]">
            <Icon className="h-4 w-4 text-night-lilac" strokeWidth={1.75} />
          </span>
          <span className="mt-1 block px-0.5 text-[11px] font-semibold text-night-petal">{price}</span>
        </div>
      ))}
    </div>
  )
}

// 3. The wrapped gift and the ways to send it.
const channels = [
  { icon: Link2, label: "Link" },
  { icon: MessageCircle, label: "WhatsApp" },
  { icon: QrCode, label: "QR code" },
]

function Send() {
  return (
    <div className="flex h-full items-center justify-between gap-1.5">
      <span
        className={`grid h-11 w-11 flex-none place-items-center rounded-2xl bg-night-rose/15 ring-1 ring-inset ring-night-rose/30 ${arrive}`}
        style={at(250)}
      >
        <Gift className="h-[22px] w-[22px] text-night-rose" strokeWidth={1.5} />
      </span>
      <ArrowRight className={`h-3.5 w-3.5 flex-none text-night-lilac/70 ${arrive}`} style={at(500)} />
      <ul className="flex gap-2.5">
        {channels.map(({ icon: Icon, label }, i) => (
          <li key={label} className={`flex flex-col items-center gap-1 ${arrive}`} style={at(650 + i * 120)}>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-night-petal/[0.06] ring-1 ring-inset ring-night-petal/15">
              <Icon className="h-3.5 w-3.5 text-night-petal" />
            </span>
            <span className="whitespace-nowrap text-[10px] leading-none text-night-lilac">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const visuals = { ask: Ask, choose: Choose, send: Send } satisfies Record<StepVisual, unknown>

// On phones each step is a tight stack: title and line, then the picture.
// Where there is room the picture moves beside the text: from sm (the painting
// is a card above this section) and from xl. From md up the column sits on the
// left of the pinned painting; between md and xl it stays narrow, as wide as
// the free space beside the couple, so the steps stack again there.
const column = "max-w-xl md:max-w-md xl:max-w-xl"
const card =
  "grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-3.5 p-4 sm:grid-cols-[auto_minmax(0,1fr)_14.5rem] sm:items-center sm:gap-x-5 sm:p-6 md:grid-cols-[auto_minmax(0,1fr)] md:p-5 xl:grid-cols-[auto_minmax(0,1fr)_14.5rem] xl:p-6"
const picture = "col-span-2 sm:col-span-1 md:col-span-2 xl:col-span-1"

export function HowItWorks() {
  return (
    <section
      id="how"
      aria-labelledby="how-title"
      className="relative z-10 mx-auto max-w-6xl scroll-mt-8 px-5 pb-20 pt-2 sm:px-8 md:pb-24 md:pt-0"
    >
      <div className={column}>
        <h2 id="how-title" className="font-display text-4xl leading-tight sm:text-5xl">How it works</h2>
        <p className="mt-3 leading-relaxed text-night-lilac">Majnu would have given Layla the moon. Yours takes three steps.</p>
        <ol className="mt-8 space-y-3">
          {steps.map((step, i) => {
            const Picture = visuals[step.visual]
            return (
              <li key={step.title} style={{ "--i": i } as CSSProperties}>
                <Reveal className="group/step">
                  <div className={`reveal-item rounded-3xl bg-night-velvet/80 ring-1 ring-inset ring-night-petal/10 backdrop-blur-sm ${card}`}>
                    <MoonPhase lit={step.lit} size={26} className="self-start text-night-rose sm:mt-0.5" />
                    <div>
                      <h3 className="text-balance font-display text-2xl leading-tight">{step.title}</h3>
                      <p className="mt-1.5 text-pretty text-[15px] leading-normal text-night-lilac">{step.line}</p>
                    </div>
                    <div
                      aria-hidden="true"
                      className={`h-[92px] rounded-2xl bg-night-plum/60 px-3 py-2.5 ring-1 ring-inset ring-night-petal/[0.08] ${picture}`}
                    >
                      <div className="mx-auto h-full max-w-[16rem]">
                        <Picture />
                      </div>
                    </div>
                  </div>
                </Reveal>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
