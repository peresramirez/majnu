// Email sign-in and sign-up, including a guest turning their anonymous account
// into a real one (the same user, so their gifts stay).
import { describe, expect, it, vi } from "vitest"
import { sendPasswordReset, sendSignInLink, signInWithEmail, signUpWithEmail } from "@/components/auth/email-auth"

type User = { id: string; is_anonymous?: boolean; email?: string } | null

function fakeAuth(user: User) {
  return {
    getUser: vi.fn(async () => ({ data: { user }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: {}, error: null })),
    signUp: vi.fn(async () => ({ data: { session: null, user: { id: "new" } }, error: null })),
    updateUser: vi.fn(async () => ({ data: { user: { id: user?.id, email: undefined, new_email: "anna@example.com" } }, error: null })),
  }
}

const confirmUrl = "https://majnu.app/auth/callback?next=%2Fdashboard%2Fgifts"
const credentials = { email: "anna@example.com", password: "secret-123" }

// The fake is narrower than the real client, which is all these helpers use.
const asAuth = (auth: ReturnType<typeof fakeAuth>) => auth as unknown as Parameters<typeof signUpWithEmail>[0]

describe("signInWithEmail", () => {
  it("sends the Turnstile token when there is one", async () => {
    const auth = fakeAuth(null)
    expect(await signInWithEmail(asAuth(auth), { ...credentials, captchaToken: "tok" })).toEqual({ ok: true })
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ ...credentials, options: { captchaToken: "tok" } })
  })

  it("works without a token when there is no site key", async () => {
    const auth = fakeAuth(null)
    await signInWithEmail(asAuth(auth), credentials)
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ ...credentials, options: undefined })
  })

  it("returns Supabase's error as data", async () => {
    const auth = fakeAuth(null)
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: "captcha protection: request disallowed", code: "captcha_failed" } } as never)
    expect(await signInWithEmail(asAuth(auth), credentials)).toEqual({
      ok: false,
      error: { message: "captcha protection: request disallowed", code: "captcha_failed" },
    })
  })
})

describe("signUpWithEmail", () => {
  it("adds email and password to a guest's own account instead of creating a new one", async () => {
    const auth = fakeAuth({ id: "guest-1", is_anonymous: true })
    const result = await signUpWithEmail(asAuth(auth), { ...credentials, captchaToken: "tok", confirmUrl })
    expect(auth.signUp).not.toHaveBeenCalled()
    expect(auth.updateUser).toHaveBeenCalledWith(credentials, { emailRedirectTo: confirmUrl })
    expect(result).toEqual({ ok: true, status: "confirm_email", upgradedGuest: true })
  })

  it("reports a guest as signed in when Supabase confirms the address at once", async () => {
    const auth = fakeAuth({ id: "guest-1", is_anonymous: true })
    auth.updateUser.mockResolvedValue({ data: { user: { id: "guest-1", email: "anna@example.com", new_email: undefined } }, error: null } as never)
    expect(await signUpWithEmail(asAuth(auth), { ...credentials, confirmUrl })).toEqual({ ok: true, status: "signed_in", upgradedGuest: true })
  })

  it("passes on a refused upgrade, e.g. an email that already has an account", async () => {
    const auth = fakeAuth({ id: "guest-1", is_anonymous: true })
    auth.updateUser.mockResolvedValue({ data: { user: null }, error: { message: "A user with this email address has already been registered", code: "email_exists" } } as never)
    expect(await signUpWithEmail(asAuth(auth), { ...credentials, confirmUrl })).toEqual({
      ok: false,
      error: { message: "A user with this email address has already been registered", code: "email_exists" },
      upgradedGuest: true,
    })
  })

  it("signs up a visitor without a session, with the Turnstile token", async () => {
    const auth = fakeAuth(null)
    const result = await signUpWithEmail(asAuth(auth), { ...credentials, captchaToken: "tok", confirmUrl })
    expect(auth.updateUser).not.toHaveBeenCalled()
    expect(auth.signUp).toHaveBeenCalledWith({ ...credentials, options: { captchaToken: "tok" } })
    expect(result).toEqual({ ok: true, status: "confirm_email", upgradedGuest: false })
  })

  it("reports signed_in when sign-up returns a session", async () => {
    const auth = fakeAuth(null)
    auth.signUp.mockResolvedValue({ data: { session: { access_token: "a" }, user: { id: "new" } }, error: null } as never)
    expect(await signUpWithEmail(asAuth(auth), { ...credentials, confirmUrl })).toEqual({ ok: true, status: "signed_in", upgradedGuest: false })
  })
})

describe("sendSignInLink and sendPasswordReset", () => {
  const redirectTo = "https://majnu.app/auth/callback?next=%2Fdashboard"

  function linkAuth(error: { message: string; code?: string } | null) {
    return {
      signInWithOtp: vi.fn(async () => ({ data: {}, error })),
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error })),
    }
  }
  const asLinkAuth = (auth: ReturnType<typeof linkAuth>) => auth as unknown as Parameters<typeof sendSignInLink>[0]

  it("asks for a sign-in link without creating an account", async () => {
    const auth = linkAuth(null)
    expect(await sendSignInLink(asLinkAuth(auth), { email: "anna@example.com", captchaToken: "tok", redirectTo })).toEqual({ ok: true })
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "anna@example.com",
      options: { shouldCreateUser: false, emailRedirectTo: redirectTo, captchaToken: "tok" },
    })
  })

  it("answers the same for an address with no account", async () => {
    const auth = linkAuth({ message: "Signups not allowed for otp", code: "otp_disabled" })
    expect(await sendSignInLink(asLinkAuth(auth), { email: "nobody@example.com", redirectTo })).toEqual({ ok: true })
  })

  it("passes other errors on", async () => {
    const auth = linkAuth({ message: "Email rate limit exceeded", code: "over_email_send_rate_limit" })
    expect(await sendSignInLink(asLinkAuth(auth), { email: "anna@example.com", redirectTo })).toEqual({
      ok: false,
      error: { message: "Email rate limit exceeded", code: "over_email_send_rate_limit" },
    })
  })

  it("asks for a password reset that lands on the callback", async () => {
    const auth = linkAuth(null)
    expect(await sendPasswordReset(asLinkAuth(auth), { email: "anna@example.com", redirectTo })).toEqual({ ok: true })
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("anna@example.com", { redirectTo })
  })
})
