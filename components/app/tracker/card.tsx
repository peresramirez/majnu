import type { ReactNode } from "react"

// One panel of the Tracker dashboard: a velvet card with a small title, a
// line under it and, on the right, the one figure it leads with.
export const cardSurface = "rounded-3xl bg-night-velvet p-5 ring-1 ring-inset ring-night-petal/10 sm:p-6"

export function DashboardCard({
  id,
  title,
  subtitle,
  figure,
  className = "",
  children,
}: {
  id: string
  title: string
  subtitle?: ReactNode
  figure?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className={`${cardSurface} min-w-0 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={id} className="text-[15px] font-semibold text-night-petal">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-sm text-night-lilac">{subtitle}</p>}
        </div>
        {figure !== undefined && <p className="flex-none text-[28px] font-semibold leading-none text-night-petal">{figure}</p>}
      </div>
      {children}
    </section>
  )
}

const numbers = new Intl.NumberFormat("en-GB")

// "1,284".
export function formatCount(n: number): string {
  return numbers.format(n)
}
