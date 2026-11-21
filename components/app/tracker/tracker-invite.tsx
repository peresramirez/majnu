import Link from "next/link"
import { MoonPhase } from "@/components/brand/moon-phase"
import { primaryButton } from "../styles"
import { trackerSignUpPath } from "./timeline"
import { trackerContainer } from "./tracker-view"

// What guests (anonymous accounts from the gift finder) see on the Tracker
// tab. Signing up upgrades the same account, so their gifts stay, and the
// same-site `next` brings them back here afterwards.
export function TrackerInvite() {
  return (
    <div className={trackerContainer}>
      <div className="mx-auto flex max-w-md flex-col items-start py-10 sm:py-16">
        <MoonPhase lit={0.25} size={40} className="text-night-rose" />
        <h1 className="mt-6 font-display text-[40px] leading-[1.08]">See when your gifts are opened</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-night-lilac">
          With a free account, the Tracker shows each time a gift is opened: when, roughly where, in which language
          and on which device. Everything you made as a guest stays yours.
        </p>
        <Link href={trackerSignUpPath} className={`mt-8 ${primaryButton}`}>
          Create a free account
        </Link>
      </div>
    </div>
  )
}
