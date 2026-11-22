import type React from "react"
import type { Metadata } from "next"

// Public gift pages: full-bleed, no site header or footer. The template draws
// the whole screen. Nothing here is indexed, and no page sends a referrer, so
// a letter's address never reaches another site.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100svh]">{children}</div>
}
