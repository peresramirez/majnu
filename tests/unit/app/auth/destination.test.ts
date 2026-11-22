// Where sign-in, sign-up and a guest's upgrade land (issue #47): the gift
// finder, unless a same-site `next` says otherwise.
import { describe, expect, it } from "vitest"
import { afterAuthPath } from "@/app/auth/destination"

describe("afterAuthPath", () => {
  it("lands on the gift finder without a next", () => {
    expect(afterAuthPath(null)).toBe("/dashboard/find")
    expect(afterAuthPath(undefined)).toBe("/dashboard/find")
    expect(afterAuthPath("")).toBe("/dashboard/find")
  })

  it("honours a same-site next, query and hash included", () => {
    expect(afterAuthPath("/create/abc")).toBe("/create/abc")
    expect(afterAuthPath("/dashboard")).toBe("/dashboard")
    expect(afterAuthPath("/dashboard/purchases?paid=1#latest")).toBe("/dashboard/purchases?paid=1#latest")
    expect(afterAuthPath("/billing/return?session_id=cs_test_abcdefghijkl")).toBe("/billing/return?session_id=cs_test_abcdefghijkl")
  })

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "javascript:alert(1)",
    "dashboard/find",
    " /dashboard",
  ])("lands on the finder instead of %j", (next) => {
    expect(afterAuthPath(next)).toBe("/dashboard/find")
  })

  it("never sends someone back to a sign-in page", () => {
    for (const next of ["/signin", "/signup?next=%2Fdashboard", "/auth/callback?code=abc"]) {
      expect(afterAuthPath(next)).toBe("/dashboard/find")
    }
  })

  it("ignores anything that is not a string", () => {
    expect(afterAuthPath(["/create/abc"])).toBe("/dashboard/find")
    expect(afterAuthPath({ next: "/create/abc" })).toBe("/dashboard/find")
    expect(afterAuthPath(42)).toBe("/dashboard/find")
  })
})
