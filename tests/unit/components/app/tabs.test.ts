import { describe, expect, it } from "vitest"
import { activeTab, appTabs } from "@/components/app/tabs"

describe("appTabs", () => {
  it("puts Find a gift first, then Letters & invitations, My gifts and Purchases", () => {
    expect(appTabs.map((tab) => tab.label)).toEqual(["Find a gift", "Letters & invitations", "My gifts", "Purchases"])
  })

  it("has a Purchases tab at /dashboard/purchases, not a Plan tab", () => {
    expect(appTabs.find((tab) => tab.id === "purchases")?.href).toBe("/dashboard/purchases")
    expect(appTabs.some((tab) => tab.label === "Plan")).toBe(false)
  })

  it("keeps /dashboard as the letters chat, so existing links open the same screen", () => {
    expect(appTabs.find((tab) => tab.id === "letters")?.href).toBe("/dashboard")
    expect(appTabs.find((tab) => tab.id === "find")?.href).toBe("/dashboard/find")
  })

  it("has short labels that start the full label, so screen readers hear the whole name", () => {
    for (const tab of appTabs) expect(tab.label.startsWith(tab.shortLabel)).toBe(true)
  })
})

describe("activeTab", () => {
  it.each([
    ["/dashboard/find", "find"],
    ["/dashboard", "letters"],
    ["/create/0b6f2a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5c", "letters"],
    ["/dashboard/gifts", "gifts"],
    ["/dashboard/purchases", "purchases"],
    ["/dashboard/purchases/anything", "purchases"],
    // The old Plan tab redirects to Purchases.
    ["/dashboard/plan", "purchases"],
    ["/dashboard/findings", null],
    ["/", null],
  ] as const)("%s → %s", (path, tab) => {
    expect(activeTab(path)).toBe(tab)
  })
})
