import type { ReactNode } from "react"
import { percent, type Slice } from "./analytics"
import { DashboardCard, formatCount } from "./card"

// Where, on what and in which language gifts were opened (issue #75): a list
// of names, each with its opens, its share and a thin bar of that share.
// Plain HTML, so it needs no chart code and reads as text to screen readers.
// Named rows are rose gold on a faint rose track; "Other" and "Not recorded"
// are lilac, so the real answers stand out.
export function BreakdownCard({
  id,
  title,
  subtitle,
  slices,
  emptyText,
  marker,
  className = "",
}: {
  id: string
  title: string
  subtitle?: string
  slices: Slice[]
  emptyText: string
  marker?: (slice: Slice) => ReactNode
  className?: string
}) {
  return (
    <DashboardCard id={id} title={title} subtitle={subtitle} className={className}>
      {slices.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-night-lilac">{emptyText}</p>
      ) : (
        <ul className="mt-4 space-y-3.5">
          {slices.map((slice) => {
            const named = slice.kind === "value"
            return (
              <li key={slice.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`flex min-w-0 items-center gap-2 text-[15px] ${named ? "text-night-petal" : "text-night-lilac"}`}>
                    {marker?.(slice)}
                    <span className="truncate">{slice.label}</span>
                  </span>
                  <span className="flex-none text-sm tabular-nums text-night-petal">
                    {formatCount(slice.count)}
                    <span className="sr-only"> {slice.count === 1 ? "open" : "opens"},</span>
                    <span aria-hidden="true" className="text-night-lilac">
                      {" "}
                      ·{" "}
                    </span>
                    <span className="text-night-lilac">{percent(slice.share)}</span>
                  </span>
                </div>
                <div className={`mt-1.5 h-1.5 rounded-full ${named ? "bg-night-rose/15" : "bg-night-lilac/10"}`} aria-hidden="true">
                  <div
                    className={`h-full rounded-full ${named ? "bg-night-rose" : "bg-night-lilac/50"}`}
                    style={{ width: `${Math.max(slice.share * 100, 1.5)}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </DashboardCard>
  )
}
