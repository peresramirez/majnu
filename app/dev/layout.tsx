import type React from "react"
import type { Metadata } from "next"

// Dev B's workbench: every template rendered from fixture data. Public so it
// can be used for ad screenshots, but never indexed.
export const metadata: Metadata = {
  title: "Templates",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
