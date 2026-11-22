// The cookie that carries a coupon code from a poster's short link to the
// "Make it unique" dialog (lib/billing/coupon-cookie.ts).
import { describe, expect, it } from "vitest"
import { clearCouponCookie, rememberCouponCookie, rememberedCouponCode } from "@/lib/billing/coupon-cookie"

const withCookie = (cookie: string) => new Request("https://majnu.app/api/purchases", { headers: { cookie } })

describe("the coupon cookie", () => {
  it("stores only the normalised code", () => {
    expect(rememberCouponCookie("layla 100")).toBe("majnu_coupon=LAYLA100; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax")
    expect(rememberCouponCookie("nope")).toBeNull()
    expect(rememberCouponCookie(undefined)).toBeNull()
  })

  it("is cleared with the same attributes", () => {
    expect(clearCouponCookie()).toBe("majnu_coupon=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax")
  })

  it("is read back from the request among other cookies", () => {
    expect(rememberedCouponCode(withCookie("sb-ref-auth-token=base64-abc; majnu_coupon=LAYLA100; other=1"))).toBe("LAYLA100")
    expect(rememberedCouponCode(withCookie("majnu_coupon=layla-100"))).toBe("LAYLA100")
  })

  it("counts as none when missing, empty or tampered with", () => {
    expect(rememberedCouponCode(new Request("https://majnu.app/"))).toBeNull()
    expect(rememberedCouponCode(withCookie("other=1"))).toBeNull()
    expect(rememberedCouponCode(withCookie("majnu_coupon="))).toBeNull()
    expect(rememberedCouponCode(withCookie("majnu_coupon=%3Cscript%3E"))).toBeNull()
    expect(rememberedCouponCode(withCookie("majnu_coupon=%E0%A4%A"))).toBeNull()
    expect(rememberedCouponCode(withCookie("xmajnu_coupon=LAYLA100"))).toBeNull()
  })
})
