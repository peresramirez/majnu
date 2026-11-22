import { describe, expect, it } from "vitest"
import { APP_HOME, LETTERS_CHAT, activeTab, appTabs } from "@/components/app/tabs"

describe("appTabs", () => {
  it("leads with Find a gift, then My gifts, Create and Tracker", () => {
    expect(appTabs.map((tab) => tab.label)).toEqual(["Find a gift", "My gifts", "Create", "Tracker"])
  })

  it("keeps the phone tab bar to four tabs", () => {
    expect(appTabs).toHaveLength(4)
  })

  it("opens the app on the finder, the first tab", () => {
    expect(APP_HOME).toBe("/dashboard/find")
    expect(appTabs[0].href).toBe(APP_HOME)
  })

  it("has Create at /dashboard/create and Tracker at /dashboard/tracker", () => {
    expect(appTabs.find((tab) => tab.id === "create")?.href).toBe("/dashboard/create")
    expect(appTabs.find((tab) => tab.id === "tracker")?.href).toBe("/dashboard/tracker")
  })

  it("keeps /dashboard as the letters chat, so existing links open the same screen", () => {
    expect(LETTERS_CHAT).toBe("/dashboard")
  })

  it("has no Plan, Purchases, Templates or Letters tab: they live in Create and the account menu", () => {
    for (const label of ["Plan", "Purchases", "Templates", "Letters & invitations"]) {
      expect(appTabs.some((tab) => tab.label === label)).toBe(false)
    }
  })

  it("has short labels that start the full label, so screen readers hear the whole name", () => {
    for (const tab of appTabs) expect(tab.label.startsWith(tab.shortLabel)).toBe(true)
  })

  it("has a unique id and address for each tab", () => {
    expect(new Set(appTabs.map((tab) => tab.id)).size).toBe(appTabs.length)
    expect(new Set(appTabs.map((tab) => tab.href)).size).toBe(appTabs.length)
  })
})

describe("activeTab", () => {
  it.each([
    ["/dashboard/find", "find"],
    ["/dashboard/gifts", "gifts"],
    ["/dashboard/tracker", "tracker"],
    ["/dashboard/tracker/0b6f2a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5c", "tracker"],
    // Create holds the hub, the letters chat, a gift being made and the templates.
    ["/dashboard/create", "create"],
    ["/dashboard", "create"],
    ["/create/0b6f2a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5c", "create"],
    ["/dashboard/templates", "create"],
    ["/dashboard/templates/gift-box-3d", "create"],
    // Purchases is in the account menu, and the old Plan tab redirects there.
    ["/dashboard/purchases", null],
    ["/dashboard/plan", null],
    // Look-alike paths are not tabs.
    ["/dashboard/templatesx", null],
    ["/dashboard/findings", null],
    ["/dashboard/creators", null],
    ["/creative", null],
    ["/", null],
  ] as const)("%s → %s", (path, tab) => {
    expect(activeTab(path)).toBe(tab)
  })
})
