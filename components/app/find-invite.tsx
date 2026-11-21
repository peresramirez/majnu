import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { pageContainer, primaryButton, secondaryButton } from "./styles"

// The Find a gift tab until the finder (components/finder, issue #32) can be
// mounted in the app: an invitation to the finder on the landing page.
// app/(app)/dashboard/find/page.tsx renders this; swap it for the finder there.
export function FindInvite() {
  return (
    <div className={pageContainer}>
      <div className="mx-auto flex max-w-md flex-col items-start py-10 sm:py-16">
        <MoonPhase lit={0.5} size={40} className="text-night-rose" />
        <h1 className="mt-6 font-display text-[40px] leading-[1.08]">Find a gift</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-night-lilac">
          Tell Majnu who it&apos;s for. You get three ideas that suit them, with prices from shops where you live, and
          Majnu wraps the one you choose in a page made just for them.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className={primaryButton}>
            Open the gift finder <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href="/dashboard" className={secondaryButton}>
            Write a letter instead
          </Link>
        </div>
      </div>
    </div>
  )
}
