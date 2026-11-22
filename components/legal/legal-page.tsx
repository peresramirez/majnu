import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { APP_HOME } from "@/components/app/tabs"
import { Wordmark } from "@/components/brand/wordmark"
import { SiteFooter } from "@/components/landing/site-footer"
import { legalUpdated, operator } from "@/lib/legal"
import { BackLink } from "@/lib/navigation/use-back"

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-day-orchid"

// Long reading uses the Petal (light) palette, as docs/brand.md allows.
const prose = [
  "text-[17px] leading-relaxed",
  "[&_h2]:mt-14 [&_h2]:scroll-mt-8 [&_h2]:font-display [&_h2]:text-3xl [&_h2]:leading-tight",
  "[&_h3]:mt-8 [&_h3]:text-lg [&_h3]:font-semibold",
  "[&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_li]:pl-1",
  "[&_strong]:font-semibold [&_a]:rounded [&_a]:text-day-orchid [&_a]:underline [&_a]:underline-offset-4",
].join(" ")

export function LegalPage({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-[100svh] bg-day-petal text-day-ink">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6 sm:px-8">
        <Link href="/" aria-label="Majnu home" className={`rounded ${focusRing}`}>
          <Wordmark on="light" width={112} />
        </Link>
        {/* Back to the page this tab came from on this site (an app tab, the
            finder, a gift page, the landing page); with none, signed-in
            visitors go to the app and everyone else to the landing page. */}
        <BackLink
          fallback="/"
          signedInFallback={APP_HOME}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 py-2 text-sm text-day-muted hover:text-day-ink ${focusRing}`}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </BackLink>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24 pt-8 sm:px-8 sm:pt-14">
        <h1 className="font-display text-[clamp(40px,7vw,64px)] leading-[1.05] tracking-[-0.01em]">{title}</h1>
        <p className="mt-4 text-sm text-day-muted">Last updated {legalUpdated}</p>
        {lead}
        <div className={prose}>{children}</div>
      </main>

      <SiteFooter />
    </div>
  )
}

// The operator's name and address as a block, for the Impressum and the privacy policy.
export function OperatorAddress() {
  return (
    <p>
      {operator.name}
      <br />
      {operator.street}
      <br />
      {operator.city}
      <br />
      {operator.country}
      <br />
      Email: <a href={`mailto:${operator.email}`}>{operator.email}</a>
    </p>
  )
}

// "The short version" box at the top of a long page.
export function ShortVersion({ items }: { items: ReactNode[] }) {
  return (
    <section aria-labelledby="short-version" className="mt-10 rounded-3xl bg-white p-7 ring-1 ring-inset ring-day-ink/5 sm:p-8">
      <h2 id="short-version" className="font-display text-2xl">The short version</h2>
      <ul className="mt-4 space-y-3 text-[16px] leading-relaxed [&_a]:rounded [&_a]:text-day-orchid [&_a]:underline [&_a]:underline-offset-4">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden="true" className="mt-[0.6em] h-1.5 w-1.5 flex-none rounded-full bg-day-orchid" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
