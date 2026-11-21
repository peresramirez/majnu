// The five tabs of the signed-in app (docs/plan.md, "Gift finder"), in order.
// Pure data and one pure function, so it is unit-tested; icons are chosen in
// app-shell.tsx.
//
// /dashboard stays the letters chat it has always been, so every existing link
// to it (sign-in, emails, "New gift" buttons) still opens the same screen; the
// finder lives at /dashboard/find. /create/<id> belongs to Letters & invitations.

export type TabId = "find" | "letters" | "templates" | "gifts" | "purchases"

export type AppTab = {
  id: TabId
  href: string
  label: string
  // What fits in the phone tab bar; the rest of `label` stays for screen readers.
  shortLabel: string
}

export const appTabs: readonly AppTab[] = [
  { id: "find", href: "/dashboard/find", label: "Find a gift", shortLabel: "Find a gift" },
  { id: "letters", href: "/dashboard", label: "Letters & invitations", shortLabel: "Letters" },
  // The template library (issue #40), between the chat that uses the templates and My gifts.
  { id: "templates", href: "/dashboard/templates", label: "Templates", shortLabel: "Templates" },
  { id: "gifts", href: "/dashboard/gifts", label: "My gifts", shortLabel: "My gifts" },
  { id: "purchases", href: "/dashboard/purchases", label: "Purchases", shortLabel: "Purchases" },
]

function under(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

// Which tab a path belongs to, or null for a path outside the tabs.
export function activeTab(pathname: string): TabId | null {
  if (under(pathname, "/dashboard/find")) return "find"
  if (under(pathname, "/dashboard/templates")) return "templates"
  if (under(pathname, "/dashboard/gifts")) return "gifts"
  if (under(pathname, "/dashboard/purchases")) return "purchases"
  // The old Plan tab redirects to Purchases.
  if (under(pathname, "/dashboard/plan")) return "purchases"
  if (pathname === "/dashboard" || under(pathname, "/create")) return "letters"
  return null
}
