// Calendars need a real account (lib/limits.ts): a guest sees this instead of
// the calendar screens. Signing up links the new identity to the guest
// account, so everything they made comes with them, and `next` (a same-site
// path, checked again at sign-in) brings them back here.
import Link from "next/link"
import { MoonPhase } from "@/components/brand/moon-phase"
import { primaryButton, secondaryButton } from "@/components/app/styles"
import { signInRequiredResult } from "@/lib/limits"

export function CalendarGuestGate({ next }: { next: string }) {
  const result = signInRequiredResult()
  const message = result.ok ? "" : result.message
  const to = encodeURIComponent(next)
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-16 sm:px-6">
      <MoonPhase lit={0.25} size={40} className="text-night-rose" />
      <h1 className="mt-6 font-display text-[36px] leading-tight">Create a free account for your calendar</h1>
      <p className="mt-3 text-[17px] leading-relaxed text-night-lilac">{message}</p>
      <div className="mt-8 grid gap-2.5">
        <Link href={`/signup?next=${to}`} className={`w-full ${primaryButton}`}>
          Create a free account
        </Link>
        <Link href={`/signin?next=${to}`} className={`w-full ${secondaryButton}`}>
          I have an account
        </Link>
      </div>
    </div>
  )
}
