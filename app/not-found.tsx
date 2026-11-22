import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { APP_HOME } from "@/components/app/tabs"
import { MoonPhase } from "@/components/brand/moon-phase"
import { Wordmark } from "@/components/brand/wordmark"
import { BackLink } from "@/lib/navigation/use-back"

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: false } }

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-night-rose"

// An address that leads nowhere on this site (gift links have their own page,
// app/(public)/l/[slug]/not-found.tsx). "Go back" returns to the page this tab
// came from (lib/navigation/back.ts); with none, the app for anyone signed in
// and the landing page for everyone else.
export default function NotFound() {
  return (
    <main
      data-surface="night"
      className="flex min-h-[100svh] flex-col items-center justify-center px-6 pb-[calc(2rem+var(--safe-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-center text-night-petal"
      style={{ background: "radial-gradient(120% 100% at 72% 30%, #3E2759 0%, #1B1226 58%, #100A17 100%)" }}
    >
      <Link href="/" aria-label="Majnu home" className={`rounded ${focusRing}`}>
        <Wordmark width={120} />
      </Link>
      <MoonPhase lit={0} size={36} className="mt-12 text-night-lilac" />
      <h1 className="mt-5 font-display text-[34px] leading-tight">This page isn&apos;t here</h1>
      <p className="mt-3 max-w-[32ch] text-[16px] leading-relaxed text-night-lilac">
        The address may be incomplete, or the page has moved.
      </p>
      <BackLink
        fallback="/"
        signedInFallback={APP_HOME}
        className={`mt-10 inline-flex items-center gap-2 rounded-full bg-night-rose px-6 py-3 text-[15px] font-semibold text-night-plum transition-colors duration-200 ease-calm hover:bg-[#F1C4A9] ${focusRing}`}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Go back
      </BackLink>
    </main>
  )
}
