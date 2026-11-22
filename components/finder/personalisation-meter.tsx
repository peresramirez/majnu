"use client"

// How well Majnu knows the person so far (issue #97): a small meter with the
// percentage, next to "Their profile so far", and one line with the addition
// that would raise it most ("Add their Instagram, TikTok or LinkedIn: +20").
// The bar grows when the score rises; with reduced motion it just changes.
import type { Personalisation } from "@/lib/finder/personalisation"

export function PersonalisationMeter({ value }: { value: Personalisation | null }) {
  if (!value) return null
  const score = Math.max(0, Math.min(100, Math.round(value.score)))
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-night-petal">Personalisation</span>
        <div
          role="meter"
          aria-label="Personalisation"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={score}
          aria-valuetext={`${score}% personalised`}
          className="h-1.5 w-24 overflow-hidden rounded-full bg-night-petal/10 sm:w-32"
        >
          <div
            className="h-full rounded-full bg-night-rose motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-calm"
            style={{ width: `${score}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-night-petal" aria-hidden="true">
          {score}%
        </span>
      </div>
      {value.next && (
        <p className="mt-1 text-xs text-night-lilac">
          {value.next.label}: <span className="font-semibold text-night-rose">+{value.next.gain}</span>
        </p>
      )}
    </div>
  )
}
