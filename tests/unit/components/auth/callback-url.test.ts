import { describe, expect, it } from "vitest"
import { authCallbackUrl, safeAuthErrorCode, signInErrorPath } from "@/components/auth/callback-url"

describe("authCallbackUrl", () => {
  it("carries a same-site next and drops an unsafe one", () => {
    expect(authCallbackUrl("https://majnu.app", "/dashboard/find")).toBe("https://majnu.app/auth/callback?next=%2Fdashboard%2Ffind")
    expect(authCallbackUrl("https://majnu.app/", "//evil.example")).toBe("https://majnu.app/auth/callback")
    expect(authCallbackUrl("https://majnu.app", null)).toBe("https://majnu.app/auth/callback")
  })
})

describe("safeAuthErrorCode", () => {
  it("keeps short snake_case codes only", () => {
    expect(safeAuthErrorCode("identity_already_exists")).toBe("identity_already_exists")
    expect(safeAuthErrorCode("<b>hi</b>")).toBe("unknown")
    expect(safeAuthErrorCode("Identity is already linked")).toBe("unknown")
    expect(safeAuthErrorCode("x".repeat(65))).toBe("unknown")
    expect(safeAuthErrorCode(null)).toBe("unknown")
  })
})

describe("signInErrorPath", () => {
  it("adds the code to /signin, with or without a next", () => {
    expect(signInErrorPath("otp_expired")).toBe("/signin?auth_error=otp_expired")
    expect(signInErrorPath("otp_expired", "/dashboard/plan")).toBe("/signin?next=%2Fdashboard%2Fplan&auth_error=otp_expired")
    expect(signInErrorPath("otp_expired", "https://evil.example")).toBe("/signin?auth_error=otp_expired")
  })
})
