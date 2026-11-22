import { trackerContainer } from "@/components/app/tracker/tracker-view"

const block = "rounded-full bg-night-petal/10 motion-safe:animate-pulse"

export default function Loading() {
  return (
    <div className={trackerContainer} role="status" aria-label="Loading the tracker">
      <div className={`h-10 w-36 ${block}`} />
      <div className={`mt-3 h-4 w-64 max-w-full ${block}`} />
      <ul className="mt-8 space-y-4" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="rounded-3xl bg-night-velvet p-6 ring-1 ring-inset ring-night-petal/10">
            <div className={`h-3 w-40 ${block}`} />
            <div className={`mt-5 h-6 w-36 ${block}`} />
            <div className={`mt-4 h-4 w-48 ${block}`} />
            <div className="mt-6 border-t border-night-petal/10 pt-5">
              <div className={`h-5 w-32 ${block}`} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
