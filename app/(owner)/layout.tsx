import type React from "react"
import type { Metadata } from "next"

// Owner-only pages that render full-bleed, without the app shell: the preview
// of a gift exactly as its recipient will see it (docs/plan.md, Routes).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100svh] bg-night-plum">{children}</div>
}
