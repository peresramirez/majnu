"use client"

import { useEffect } from "react"
import { MoonPhase } from "@/components/brand/moon-phase"

export default function PreviewError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="dark flex min-h-[100svh] flex-col items-center justify-center px-6 text-center text-night-petal">
      <MoonPhase lit={0.5} size={40} className="text-night-rose" />
      <p className="mt-5 font-display text-2xl">The preview didn&apos;t load</p>
      <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-night-lilac">Your gift is saved. Try loading the preview again.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-full bg-night-rose px-5 py-2.5 text-[15px] font-semibold text-night-plum hover:bg-[#F1C4A9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-night-rose"
      >
        Try again
      </button>
    </div>
  )
}
