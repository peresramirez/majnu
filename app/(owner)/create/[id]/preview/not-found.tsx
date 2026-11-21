import { MoonPhase } from "@/components/brand/moon-phase"

export default function PreviewNotFound() {
  return (
    <div className="dark flex min-h-[100svh] flex-col items-center justify-center px-6 text-center text-night-petal">
      <MoonPhase lit={0} size={40} className="text-night-lilac" />
      <p className="mt-5 font-display text-2xl">This preview isn&apos;t here</p>
      <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-night-lilac">
        Previews are only for the person who made the gift. Sign in with that account to see it.
      </p>
    </div>
  )
}
