// The `next` parameter carried through sign-in must never send anyone to
// another site (open redirect).
import { describe, expect, it } from "vitest"
import { afterSignInPath, nextPathFromSearch, safeNextPath, withNext } from "@/lib/billing/next-path"

describe("safeNextPath", () => {
  it("accepts same-site paths, with a query and a hash", () => {
    expect(safeNextPath("/dashboard/plan")).toBe("/dashboard/plan")
    expect(safeNextPath("/create/123")).toBe("/create/123")
    expect(safeNextPath("/billing/return?session_id=cs_test_abc")).toBe("/billing/return?session_id=cs_test_abc")
    expect(safeNextPath("/dashboard#top")).toBe("/dashboard#top")
  })

  it.each([
    ["protocol-relative", "//evil.example"],
    ["protocol-relative with path", "//evil.example/dashboard"],
    ["backslash host", "/\\evil.example"],
    ["double backslash", "\\\\evil.example"],
    ["backslash later on", "/dashboard\\..\\..\\evil"],
    ["absolute https URL", "https://evil.example/dashboard"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,hi"],
    ["scheme without slashes", "https:evil.example"],
    ["tab that the URL parser strips", "/\t/evil.example"],
    ["newline that the URL parser strips", "/\n/evil.example"],
    ["leading space", " /dashboard"],
    ["no leading slash", "dashboard"],
    ["empty", ""],
    ["too long", `/${"a".repeat(600)}`],
  ])("rejects %s", (_name, value) => {
    expect(safeNextPath(value)).toBeNull()
  })

  it("rejects values that are not strings", () => {
    expect(safeNextPath(null)).toBeNull()
    expect(safeNextPath(undefined)).toBeNull()
    expect(safeNextPath(["/dashboard"])).toBeNull()
  })

  it("keeps an encoded slash as a path on this site", () => {
    // "/%2F%2Fevil.example" is a path segment here, not a host.
    expect(safeNextPath("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example")
  })

  it("does not send a signed-in user back to the sign-in pages", () => {
    expect(safeNextPath("/signin")).toBeNull()
    expect(safeNextPath("/signup?next=/dashboard")).toBeNull()
    expect(safeNextPath("/auth/callback")).toBeNull()
    expect(safeNextPath("/signinx")).toBe("/signinx")
  })
})

describe("nextPathFromSearch", () => {
  it("turns ?plan=full-moon into the Plan tab", () => {
    expect(nextPathFromSearch(new URLSearchParams("plan=full-moon"))).toBe("/dashboard/plan")
  })

  it("prefers a valid next over the plan", () => {
    expect(nextPathFromSearch(new URLSearchParams("plan=full-moon&next=/create/1"))).toBe("/create/1")
  })

  it("falls back to the plan when next is unsafe, and to null without either", () => {
    expect(nextPathFromSearch(new URLSearchParams("plan=full-moon&next=//evil.example"))).toBe("/dashboard/plan")
    expect(nextPathFromSearch(new URLSearchParams("next=https://evil.example"))).toBeNull()
    expect(nextPathFromSearch(new URLSearchParams("plan=other"))).toBeNull()
    expect(nextPathFromSearch(new URLSearchParams(""))).toBeNull()
  })
})

describe("afterSignInPath and withNext", () => {
  it("defaults to the dashboard", () => {
    expect(afterSignInPath("//evil.example")).toBe("/dashboard")
    expect(afterSignInPath(null)).toBe("/dashboard")
    expect(afterSignInPath("/dashboard/plan")).toBe("/dashboard/plan")
  })

  it("encodes next into links between the sign-in pages", () => {
    expect(withNext("/signup", "/dashboard/plan")).toBe("/signup?next=%2Fdashboard%2Fplan")
    expect(withNext("/signup", null)).toBe("/signup")
  })
})
