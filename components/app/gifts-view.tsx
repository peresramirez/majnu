import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import type { LetterSummary } from "@/lib/letters/store"
import { GiftCard } from "./gift-card"
import { pageContainer, primaryButton } from "./styles"

// The My gifts tab: every gift, newest first, with when it was opened.
export function GiftsView({ letters, now }: { letters: LetterSummary[]; now: Date }) {
  if (letters.length === 0) {
    return (
      <div className={pageContainer}>
        <div className="mx-auto flex max-w-md flex-col items-start py-10 sm:py-16">
          <MoonPhase lit={0} size={40} className="text-night-lilac" />
          <h1 className="mt-6 font-display text-[40px] leading-[1.08]">No gifts yet</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-night-lilac">
            Your gifts appear here once you make one, with the moment each one is opened.
          </p>
          <Link href="/dashboard" className={`mt-8 ${primaryButton}`}>
            Create a gift <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    )
  }

  const opened = letters.filter((l) => l.stats.totalOpens > 0).length
  return (
    <div className={pageContainer}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[34px] leading-tight md:text-[40px]">My gifts</h1>
          <p className="mt-1 text-night-lilac">
            {letters.length === 1 ? "1 gift" : `${letters.length} gifts`}, {opened} opened
          </p>
        </div>
        <Link href="/dashboard" className={`hidden sm:inline-flex ${primaryButton}`}>
          Create a gift
        </Link>
      </div>
      <ul className="mt-8 grid gap-4 md:grid-cols-2">
        {letters.map((letter) => (
          <li key={letter.id}>
            <GiftCard letter={letter} now={now} />
          </li>
        ))}
      </ul>
    </div>
  )
}
