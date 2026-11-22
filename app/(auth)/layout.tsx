import type React from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { GiftScene } from "@/components/landing/gift-scene"
import { APP_HOME } from "@/components/app/tabs"
import { Wordmark } from "@/components/brand/wordmark"
import { BackLink } from "@/lib/navigation/use-back"

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-night-rose"

// Sign-in and sign-up: the night palette (the `dark` class switches the form
// components to it) with the scene of Majnu giving Layla the moon beside the form.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="night" className="dark min-h-[100svh] bg-night-plum text-night-petal md:grid md:grid-cols-[1.1fr_1fr]">
      <div className="relative h-64 md:sticky md:top-0 md:h-[100svh]">
        <GiftScene variant="panel" />
        <div className="pointer-events-none absolute inset-x-0 -bottom-px h-24 bg-gradient-to-t from-night-plum to-transparent md:hidden" />
        <div className="pointer-events-none absolute inset-y-0 -right-px hidden w-32 bg-gradient-to-l from-night-plum to-transparent md:block" />
        <p className="absolute bottom-8 left-8 hidden max-w-xs font-display text-2xl leading-snug text-night-petal/90 md:block">
          Majnu would have given Layla the moon.
        </p>
      </div>

      <div className="relative flex flex-col px-5 pb-10 pt-6 sm:px-10 md:min-h-[100svh] md:px-14 md:pt-10">
        <div className="flex items-center justify-between">
          <Link href="/" className={`rounded ${focusRing}`} aria-label="Majnu home">
            <Wordmark width={112} />
          </Link>
          {/* Back to the page that sent them here (a same-site `next` when the
              tab has no earlier page), never to another sign-in page; with
              none, a guest goes back to the app and a visitor to the landing page. */}
          <BackLink
            fallback="/"
            signedInFallback={APP_HOME}
            honourNext
            className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 py-2 text-sm text-night-lilac hover:text-night-petal ${focusRing}`}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </BackLink>
        </div>

        <main className="flex flex-1 items-center py-10 md:py-16">
          <div className="mx-auto w-full max-w-sm">{children}</div>
        </main>

        <p className="mx-auto max-w-sm text-center text-xs leading-relaxed text-night-lilac/80">
          By continuing, you agree to the{" "}
          <Link href="/terms" className={`rounded underline underline-offset-4 hover:text-night-petal ${focusRing}`}>terms</Link>{" "}
          and confirm you have read the{" "}
          <Link href="/privacy" className={`rounded underline underline-offset-4 hover:text-night-petal ${focusRing}`}>privacy policy</Link>.
          Questions? <a href="mailto:hello@majnu.app" className={`rounded underline underline-offset-4 hover:text-night-petal ${focusRing}`}>hello@majnu.app</a>
        </p>
      </div>
    </div>
  )
}
