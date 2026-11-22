import type React from "react"
import type { Metadata, Viewport } from "next"
import "./pitch/deck.css"

// The pitch deck's own layout: full screen, no site header or footer. The
// title and link preview stay generic ("Majnu") and say nothing about the
// deck, and nothing here is indexed or kept in a cache.
export const metadata: Metadata = {
  title: { absolute: "Majnu" },
  openGraph: { title: "Majnu" },
  twitter: { title: "Majnu" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export const viewport: Viewport = {
  themeColor: "#100A17",
  colorScheme: "dark",
}

export default function PitchLayout({ children }: { children: React.ReactNode }) {
  return children
}
