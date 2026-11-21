// The four tabs of the signed-in app (docs/plan.md, "Gift finder"), in order.
// Pure data and one pure function, so it is unit-tested; icons are chosen in
// app-shell.tsx.
//
// /dashboard stays the letters chat it has always been, so every existing link
// to it (sign-in, emails, "New gift" buttons) still opens the same screen; the
// finder lives at /dashboard/find. /create/<id> belongs to Letters & invitations.

export type TabId = "find" | "letters" | "gifts" | "plan"

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
  { id: "gifts", href: "/dashboard/gifts", label: "My gifts", shortLabel: "My gifts" },
  { id: "plan", href: "/dashboard/plan", label: "Plan", shortLabel: "Plan" },
]

function under(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

// Which tab a path belongs to, or null for a path outside the tabs.
export function activeTab(pathname: string): TabId | null {
  if (under(pathname, "/dashboard/find")) return "find"
  if (under(pathname, "/dashboard/gifts")) return "gifts"
  if (under(pathname, "/dashboard/plan")) return "plan"
  if (pathname === "/dashboard" || under(pathname, "/create")) return "letters"
  return null
}
