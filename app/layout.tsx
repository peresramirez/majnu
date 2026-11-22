import type React from "react"
import type { Metadata, Viewport } from "next"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import AuthProvider from "@/components/auth/auth-provider"
import { TrailRecorder } from "@/lib/navigation/use-back"
import { site } from "@/lib/site"
import { display, sans } from "./fonts"

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name}: ${site.tagline}`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  openGraph: {
    type: "website",
    siteName: site.name,
    title: `${site.name}: ${site.tagline}`,
    description: site.description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name}: ${site.tagline}`,
    description: site.description,
  },
}

export const viewport: Viewport = {
  themeColor: "#1B1226",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // data-scroll-behavior: Next.js keeps turning smooth scrolling off while it
    // changes pages, so a route change lands at the top at once.
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={`${sans.variable} ${display.variable} font-sans`}>
        {/* Remembers the pages this tab visits, for the Back links (lib/navigation/back.ts). */}
        <TrailRecorder />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
