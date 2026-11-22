"use client"

// The personalisation score, always beside the message box (developer's
// request, 22 November): a small ring that fills with the score, around a face
// that smiles more as Majnu knows the person better. Hover or focus shows
// "Personalisation score: 40%". With reduced motion it just changes.
import type { Personalisation } from "@/lib/finder/personalisation"

const SIZE = 36
const R = 15
const CIRCUMFERENCE = 2 * Math.PI * R

export function PersonalisationRing({ value }: { value: Personalisation | null }) {
  const score = Math.max(0, Math.min(100, Math.round(value?.score ?? 0)))
  // The mouth: flat at 0, a wide smile at 100.
  const smile = 2 + (score / 100) * 6
  const label = `Personalisation score: ${score}%`
  const hint = value?.next ? `${value.next.label}: +${value.next.gain}` : null
  return (
    <span className="group/ring relative flex h-10 w-10 shrink-0 items-center justify-center">
      <span
        role="meter"
        tabIndex={0}
        aria-label="Personalisation score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-valuetext={hint ? `${score}%. ${hint}` : `${score}%`}
        title={hint ? `${label}. ${hint}` : label}
        className="flex h-9 w-9 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-night-rose"
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <circle cx={18} cy={18} r={R} fill="none" strokeWidth={2.5} className="stroke-night-petal/15" />
          <circle
            cx={18}
            cy={18}
            r={R}
            fill="none"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - score / 100)}
            transform="rotate(-90 18 18)"
            className="stroke-night-rose motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700 motion-safe:ease-calm"
          />
          <circle cx={14} cy={15.5} r={1.4} className="fill-night-petal" />
          <circle cx={22} cy={15.5} r={1.4} className="fill-night-petal" />
          <path
            d={`M12.5 20.5 Q18 ${20.5 + smile} 23.5 20.5`}
            fill="none"
            strokeWidth={1.6}
            strokeLinecap="round"
            className="stroke-night-petal"
          />
        </svg>
      </span>
      {/* The words, on hover and focus, above the ring. */}
      <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-max max-w-[240px] rounded-lg bg-night-deep px-2.5 py-1.5 text-xs text-night-petal shadow-lg ring-1 ring-night-petal/15 group-focus-within/ring:block group-hover/ring:block">
        <span className="font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-night-lilac">{hint}</span>}
      </span>
    </span>
  )
}
