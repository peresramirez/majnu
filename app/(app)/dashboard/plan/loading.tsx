import { pagePadding } from "@/components/app/styles"

const block = "rounded-full bg-night-petal/10 motion-safe:animate-pulse"

export default function Loading() {
  return (
    <div className={`max-w-4xl ${pagePadding}`} role="status" aria-label="Loading your plan">
      <div className={`h-10 w-24 ${block}`} />
      <div className={`mt-3 h-4 w-40 ${block}`} />
      <div className="mt-8 grid gap-4 md:grid-cols-2" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="h-80 rounded-3xl ring-1 ring-inset ring-night-petal/10 motion-safe:animate-pulse" />
        ))}
      </div>
    </div>
  )
}
