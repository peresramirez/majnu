import { cardSurface } from "@/components/app/tracker/card"
import { trackerContainer } from "@/components/app/tracker/tracker-view"

const block = "rounded-full bg-night-petal/10 motion-safe:animate-pulse"

// The dashboard's shape while it loads: the headline row, the charts and the
// first gifts, so nothing jumps when the numbers arrive.
export default function Loading() {
  return (
    <div className={trackerContainer} role="status" aria-label="Loading the tracker">
      <div className={`h-10 w-36 ${block}`} />
      <div className={`mt-3 h-4 w-64 max-w-full ${block}`} />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:mt-8 lg:grid-cols-6" aria-hidden="true">
        <div className={`${cardSurface} col-span-2 min-h-[162px]`}>
          <div className={`h-3 w-20 ${block}`} />
          <div className={`mt-4 h-10 w-24 ${block}`} />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${cardSurface} min-h-[115px]`}>
            <div className={`h-3 w-16 ${block}`} />
            <div className={`mt-4 h-8 w-12 ${block}`} />
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 md:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        <div className={`${cardSurface} md:col-span-2`}>
          <div className={`h-4 w-28 ${block}`} />
          <div className="mt-8 h-44 rounded-2xl bg-night-petal/[0.04] sm:h-52" />
        </div>
        <div className={cardSurface}>
          <div className={`h-4 w-24 ${block}`} />
          <div className={`mt-8 h-3 w-full ${block}`} />
          <div className={`mt-6 h-3 w-3/4 ${block}`} />
          <div className={`mt-6 h-3 w-1/2 ${block}`} />
        </div>
      </div>
    </div>
  )
}
