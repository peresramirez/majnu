// The four tabs of the signed-in app (docs/features/app-shell.md), in order.
// Pure data and one pure function, so it is unit-tested; icons are chosen in
// app-shell.tsx.
//
// The app leads with finding a gift (issue #47): sign-in, sign-up and a guest's
// upgrade land on Find a gift, and the wordmark goes back to it. Letters,
// invitations, advent calendars and the template gallery are the optional
// extras, grouped under Create. /dashboard stays the letters chat it has always
// been, so every existing link to it (emails, "New gift" buttons, the template
// gallery's "Use this template") still opens the same screen; it, /create/<id>
// and /dashboard/templates all belong to Create. Purchases (the personalised
// wrappers bought) is in the account menu, so the phone tab bar stays at four.

export type TabId = "find" | "gifts" | "create" | "tracker"

export type AppTab = {
  id: TabId
  href: string
  label: string
  // What fits in the phone tab bar; the rest of `label` stays for screen readers.
  shortLabel: string
}

// Where the app opens: after signing in or up, and from the wordmark.
export const APP_HOME = "/dashboard/find"

export const appTabs: readonly AppTab[] = [
  { id: "find", href: APP_HOME, label: "Find a gift", shortLabel: "Find a gift" },
  { id: "gifts", href: "/dashboard/gifts", label: "My gifts", shortLabel: "My gifts" },
  // Letters, invitations, advent calendars and the Templates gallery.
  { id: "create", href: "/dashboard/create", label: "Create", shortLabel: "Create" },
  // Who opened each gift, where and when (issue #49, built in its own branch).
  { id: "tracker", href: "/dashboard/tracker", label: "Tracker", shortLabel: "Tracker" },
]

// The letters chat: an empty chat at /dashboard, an existing gift at /create/<id>.
export const LETTERS_CHAT = "/dashboard"

export const PURCHASES = "/dashboard/purchases"

function under(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

// Which tab a path belongs to, or null for a path outside the tabs (Purchases,
// which lives in the account menu, and anything outside the app).
export function activeTab(pathname: string): TabId | null {
  if (under(pathname, "/dashboard/find")) return "find"
  if (under(pathname, "/dashboard/gifts")) return "gifts"
  if (under(pathname, "/dashboard/tracker")) return "tracker"
  if (under(pathname, "/dashboard/create") || under(pathname, "/dashboard/templates")) return "create"
  if (pathname === LETTERS_CHAT || under(pathname, "/create")) return "create"
  return null
}
