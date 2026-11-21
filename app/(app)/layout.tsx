import type React from "react"
import type { Metadata, Viewport } from "next"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/app/app-shell"
import { getSignedInUser } from "@/components/app/session"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

// viewport-fit=cover makes the phone's safe-area insets available to the tab
// bar; resizes-content lets Android shrink the page when the keyboard opens,
// so the message box stays above it.
export const viewport: Viewport = {
  themeColor: "#1B1226",
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
}

// The signed-in app: Create, My gifts and Plan (docs/plan.md).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSignedInUser()
  if (!user) redirect("/signin")
  return <AppShell user={user}>{children}</AppShell>
}
