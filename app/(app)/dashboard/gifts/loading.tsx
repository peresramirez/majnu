import { pageContainer } from "@/components/app/styles"

const block = "rounded-full bg-night-petal/10 motion-safe:animate-pulse"

export default function Loading() {
  return (
    <div className={pageContainer} role="status" aria-label="Loading your gifts">
      <div className={`h-10 w-44 ${block}`} />
      <div className={`mt-3 h-4 w-28 ${block}`} />
      <ul className="mt-8 grid gap-4 md:grid-cols-2" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="rounded-3xl bg-night-velvet p-6 ring-1 ring-inset ring-night-petal/10">
            <div className={`h-3 w-40 ${block}`} />
            <div className={`mt-5 h-6 w-36 ${block}`} />
            <div className={`mt-4 h-4 w-48 ${block}`} />
            <div className="mt-7 flex gap-2">
              <div className={`h-9 w-24 ${block}`} />
              <div className={`h-9 w-28 ${block}`} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
