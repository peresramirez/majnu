import { describe, expect, it } from "vitest"
import { callbackErrorMessage, friendlyAuthError, offersGoogleAnyway } from "@/components/auth/auth-errors"

describe("friendlyAuthError", () => {
  it("explains known Supabase codes in plain words", () => {
    expect(friendlyAuthError({ code: "invalid_credentials", message: "Invalid login credentials" }, "x")).toMatch(/don't match/)
    expect(friendlyAuthError({ code: "captcha_failed", message: "captcha protection: request disallowed" }, "x")).toMatch(/not a bot/)
    expect(friendlyAuthError({ code: "manual_linking_disabled", message: "Manual linking is disabled" }, "x")).toMatch(/with email/)
  })

  it("falls back to the message when there is no code", () => {
    expect(friendlyAuthError({ message: "User already registered" }, "x")).toMatch(/Sign in instead/)
    expect(friendlyAuthError({ message: "Something new" }, "x")).toBe("Something new")
    expect(friendlyAuthError(undefined, "We couldn't sign you in.")).toBe("We couldn't sign you in.")
  })

  it("tells a guest that an existing account cannot take their guest gifts", () => {
    const text = friendlyAuthError({ code: "email_exists", message: "A user with this email address has already been registered" }, "x", { guest: true })
    expect(text).toMatch(/Sign in instead/)
    expect(text).toMatch(/can't merge/)
  })
})

describe("callbackErrorMessage", () => {
  it("maps known codes and never echoes the URL", () => {
    expect(callbackErrorMessage("identity_already_exists")).toMatch(/already has a Majnu account/)
    expect(callbackErrorMessage("exchange_failed")).toMatch(/Sign in below/)
    expect(callbackErrorMessage("unknown")).toBe("Something went wrong while signing you in. Try again.")
    expect(callbackErrorMessage(null)).toBeNull()
  })
})

describe("offersGoogleAnyway", () => {
  it("offers switching accounts only when linking was refused", () => {
    expect(offersGoogleAnyway("identity_already_exists")).toBe(true)
    expect(offersGoogleAnyway("manual_linking_disabled")).toBe(true)
    expect(offersGoogleAnyway("access_denied")).toBe(false)
    expect(offersGoogleAnyway(undefined)).toBe(false)
  })
})
