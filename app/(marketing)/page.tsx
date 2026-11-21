import Link from "next/link"
import { ArrowRight, CalendarDays, Gift, Mail, MapPin } from "lucide-react"
import { site } from "@/lib/site"

const formats = [
  {
    name: "Letter",
    note: "For a birthday, a thank-you, or no reason at all.",
    price: "Free",
    icon: Mail,
    panel: "bg-airmail-blue text-white",
  },
  {
    name: "Invitation",
    note: "Date, place and a map your guests can open.",
    price: "Free",
    icon: MapPin,
    panel: "bg-airmail-red text-white",
  },
  {
    name: "Gift",
    note: "Tuck in a gift code they reveal with a tap.",
    price: "Free",
    icon: Gift,
    panel: "bg-airmail-sun text-airmail-ink",
  },
  {
    name: "Advent calendar",
    note: "One door a day, each with a note or a gift.",
    price: "€4.99",
    icon: CalendarDays,
    panel: "bg-airmail-ink text-white",
  },
]

const steps = [
  {
    title: "Tell Majnu who it's for",
    body: "Answer a few questions in a chat. It drafts the words with you, and you change whatever you like.",
  },
  {
    title: "Choose a design",
    body: "Pick the look that fits: a classic letter, a party invitation, a gift to unwrap, a calendar of doors.",
  },
  {
    title: "Share the link",
    body: "Send it by WhatsApp, email or QR code. You can see when it has been opened.",
  },
]

const focusOnBlue =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"

function WriteButton({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/signin"
      className={`inline-flex items-center justify-center gap-2 rounded-md bg-airmail-red px-7 py-3.5 text-base font-bold text-white shadow-[0_4px_0_0_#9E1F1B] transition-transform hover:translate-y-0.5 hover:shadow-[0_2px_0_0_#9E1F1B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-airmail-ink motion-reduce:transition-none ${className}`}
    >
      Write a letter
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  )
}

function Postmark({ id, className = "" }: { id: string; className?: string }) {
  return (
    <svg viewBox="0 0 150 80" className={className} fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="40" cy="40" r="37" strokeWidth="2" />
      <circle cx="40" cy="40" r="23" strokeWidth="1.5" />
      <path id={id} d="M 11 40 a 29 29 0 1 1 58 0 a 29 29 0 1 1 -58 0" stroke="none" />
      <text fill="currentColor" stroke="none" fontSize="7" fontWeight="700" letterSpacing="1.1" className="font-mono">
        <textPath href={`#${id}`}>MAJNU POST • DELIVERED BY LINK •</textPath>
      </text>
      <text x="40" y="38" textAnchor="middle" fill="currentColor" stroke="none" fontSize="9" fontWeight="700" className="font-mono">
        BY
      </text>
      <text x="40" y="49" textAnchor="middle" fill="currentColor" stroke="none" fontSize="9" fontWeight="700" className="font-mono">
        LINK
      </text>
      {[22, 34, 46, 58].map((y) => (
        <path key={y} d={`M80 ${y} q8.5 -6 17 0 t17 0 t17 0 t17 0`} strokeWidth="2" strokeLinecap="round" />
      ))}
    </svg>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-airmail-blue text-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <span className="text-2xl font-extrabold tracking-tight">{site.name}</span>
        <Link
          href="/signin"
          className={`rounded text-sm font-semibold underline decoration-white/40 underline-offset-4 hover:decoration-white ${focusOnBlue}`}
        >
          Sign in
        </Link>
      </header>

      <main>
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-2 sm:px-6 sm:pb-24">
          <div className="airmail-edge rounded-md p-2.5 shadow-2xl shadow-black/30 sm:p-3">
            <div className="grid gap-8 rounded-sm bg-airmail-paper p-5 text-airmail-ink sm:p-9 lg:grid-cols-[1.35fr_1fr] lg:gap-10 lg:p-14">
              <div className="flex flex-col">
                <div className="flex items-start justify-between gap-4">
                  <p className="w-fit shrink-0 whitespace-nowrap bg-airmail-blue px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-white sm:tracking-[0.2em]">
                    Par avion · By link
                  </p>
                  <div className="relative lg:hidden">
                    <Stamp />
                  </div>
                </div>

                <h1 className="mt-7 text-balance text-[2.6rem] font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:mt-10 lg:text-7xl">
                  Write them a letter. Send it as a link.
                </h1>
                <p className="mt-5 max-w-xl text-lg leading-relaxed text-airmail-ink/75">
                  Tell Majnu who it&apos;s for and what you want to say. It helps you write it, wraps it in a design you
                  choose, and gives you a link and a QR code to share.
                </p>

                <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <WriteButton className="w-full sm:w-auto" />
                  <a
                    href="#send"
                    className="rounded text-center text-sm font-semibold text-airmail-ink underline decoration-airmail-ink/30 underline-offset-4 hover:decoration-airmail-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-airmail-ink"
                  >
                    See what you can send
                  </a>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-10">
                <div className="relative hidden self-end lg:block">
                  <Stamp large />
                </div>
                <dl className="w-full max-w-xs space-y-4 self-start font-mono lg:self-end">
                  {[
                    ["To", "Layla"],
                    ["From", "Majnu"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-end gap-3 border-b border-airmail-ink/25 pb-1">
                      <dt className="w-12 shrink-0 pb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-airmail-postmark">
                        {label}
                      </dt>
                      <dd className="font-hand text-4xl leading-none">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>

        <section id="send" className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 pb-20 sm:px-6 sm:pb-28">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">What you can send</h2>
          <ul className="mt-8 flex flex-wrap gap-4 sm:gap-6">
            {formats.map(({ name, note, price, icon: Icon, panel }) => (
              <li key={name} className="stamp-perf h-[204px] w-[156px] drop-shadow-md sm:h-[228px] sm:w-[192px]">
                <div className={`flex h-full flex-col justify-between p-3 sm:p-4 ${panel}`}>
                  <div className="flex items-start justify-between">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                    <span className="font-mono text-xs font-bold tracking-wide">{price}</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold leading-tight sm:text-xl">{name}</h3>
                    <p className="mt-1 text-[13px] leading-snug opacity-90 sm:text-sm">{note}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-8 max-w-xl font-mono text-sm leading-relaxed text-white/85">
            Postage: letters, invitations and gifts are free. An advent calendar costs €4.99 (EUR), paid once.
          </p>
        </section>

        <section className="bg-airmail-paper text-airmail-ink">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">From first word to sent</h2>
            <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
              {steps.map((step, index) => (
                <li key={step.title}>
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-airmail-postmark font-mono text-lg font-bold text-airmail-postmark outline outline-1 outline-offset-[-6px] outline-airmail-postmark/60"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-5 text-xl font-bold">{step.title}</h3>
                  <p className="mt-2 leading-relaxed text-airmail-ink/75">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-6xl flex-col items-start gap-7 px-4 py-16 sm:px-6 sm:py-24">
          <h2 className="text-balance text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            Who is yours for?
          </h2>
          <WriteButton />
        </section>
      </main>

      <footer className="bg-airmail-ink">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-white/70 sm:px-6">
          <span>
            © {new Date().getFullYear()} {site.name}
          </span>
          <Link href="/signin" className={`rounded underline-offset-4 hover:text-white hover:underline ${focusOnBlue}`}>
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  )
}

function Stamp({ large = false }: { large?: boolean }) {
  return (
    <>
      <div
        className={`stamp-perf rotate-[4deg] animate-stamp-press drop-shadow-[0_1px_1px_rgba(19,26,51,0.35)] motion-reduce:animate-none ${
          large ? "h-[132px] w-[108px]" : "h-[96px] w-[84px]"
        }`}
        aria-hidden="true"
      >
        <div className="flex h-full flex-col items-center justify-center bg-airmail-sun text-airmail-ink">
          <span className={`font-extrabold leading-none ${large ? "text-6xl" : "text-4xl"}`}>M</span>
          <span className={`mt-1 font-mono font-bold uppercase tracking-[0.18em] ${large ? "text-[9px]" : "text-[7px]"}`}>
            Majnu post
          </span>
        </div>
      </div>
      <Postmark
        id={large ? "postmark-ring-large" : "postmark-ring"}
        className={`pointer-events-none absolute animate-postmark-in text-airmail-postmark opacity-80 motion-reduce:animate-none ${
          large ? "-left-28 top-9 w-44 -rotate-12" : "-left-[4.5rem] top-9 w-28 -rotate-12"
        }`}
      />
    </>
  )
}
