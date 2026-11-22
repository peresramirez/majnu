// Each kind of account email: subject, recipient, the /auth/confirm link in
// both html and text, the six-digit code, and the brand wording rules.
import { describe, expect, it } from "vitest"
import { buildAuthEmails, confirmLink, nextFromRedirect, UnsupportedEmailError, type HookPayload } from "@/lib/email/auth-emails"

const SITE = "https://majnu.app"

function payload(type: string, extra: Partial<HookPayload["email_data"]> = {}, user: HookPayload["user"] = { email: "anna@example.com" }): HookPayload {
  return {
    user,
    email_data: {
      email_action_type: type,
      token: "305805",
      token_hash: "pkce_7d5b7b1964cf5d388340a7f04f1dbb5e",
      redirect_to: "https://majnu.app/auth/callback?next=%2Fdashboard%2Fgifts",
      site_url: "https://example.supabase.co/auth/v1",
      token_new: "",
      token_hash_new: "",
      ...extra,
    },
  }
}

const cases = [
  ["signup", "Confirm your email for Majnu", "Confirm your email"],
  ["magiclink", "Your sign-in link for Majnu", "Sign in"],
  ["recovery", "Reset your Majnu password", "Choose a new password"],
  ["invite", "You're invited to Majnu", "Accept the invitation"],
] as const

describe("buildAuthEmails", () => {
  for (const [type, subject, button] of cases) {
    it(`renders ${type} with its link in html and text`, () => {
      const [email, ...rest] = buildAuthEmails(payload(type), { siteUrl: SITE })
      expect(rest).toHaveLength(0)
      expect(email.to).toBe("anna@example.com")
      expect(email.subject).toBe(subject)
      const link = `https://majnu.app/auth/confirm?token_hash=pkce_7d5b7b1964cf5d388340a7f04f1dbb5e&type=${type}&next=%2Fdashboard%2Fgifts`
      expect(email.text).toContain(link)
      expect(email.html).toContain(`href="${link.replace(/&/g, "&amp;")}"`)
      expect(email.html).toContain(button)
      // No code beside a link: there is nowhere in Majnu to type it.
      expect(email.text).not.toContain("305805")
      expect(email.html).not.toContain("305805")
      expect(email.html).toContain("https://majnu.app/brand/majnu-wordmark-on-dark.png")
      for (const body of [email.html, email.text, email.subject]) {
        expect(body).not.toMatch(/!(?!doctype)/i)
        // Supabase's own type name may appear in the link, never in the words.
        expect(body.replace(/type=magiclink/g, "").toLowerCase()).not.toContain("magic")
      }
    })
  }

  it("treats Supabase's 'email' type as a sign-in link", () => {
    const [email] = buildAuthEmails(payload("email"), { siteUrl: SITE })
    expect(email.subject).toBe("Your sign-in link for Majnu")
    expect(email.text).toContain("type=email")
  })

  it("sends a code without a link for reauthentication", () => {
    const [email] = buildAuthEmails(payload("reauthentication"), { siteUrl: SITE })
    expect(email.subject).toBe("Your Majnu verification code")
    expect(email.text).toContain("Your code: 305805")
    expect(email.text).not.toContain("/auth/confirm")
    expect(email.html).not.toContain("/auth/confirm")
  })

  it("sends two emails for a secure email change, with Supabase's reversed hash names", () => {
    const emails = buildAuthEmails(
      payload("email_change", { token: "111111", token_hash: "hash-for-new", token_new: "222222", token_hash_new: "hash-for-current" }, {
        email: "old@example.com",
        new_email: "new@example.com",
      }),
      { siteUrl: SITE },
    )
    expect(emails.map((e) => e.to)).toEqual(["old@example.com", "new@example.com"])
    expect(emails[0].text).toContain("token_hash=hash-for-current&type=email_change")
    expect(emails[0].text).not.toContain("111111")
    expect(emails[1].text).toContain("token_hash=hash-for-new&type=email_change")
    expect(emails[1].text).not.toContain("222222")
  })

  it("sends one email to the new address when secure email change is off (a guest adding an email)", () => {
    const emails = buildAuthEmails(payload("email_change", { token_hash: "hash-only" }, { email: "", new_email: "new@example.com" }), { siteUrl: SITE })
    expect(emails).toHaveLength(1)
    expect(emails[0].to).toBe("new@example.com")
    expect(emails[0].subject).toBe("Confirm your new email for Majnu")
    expect(emails[0].text).toContain("token_hash=hash-only&type=email_change&next=%2Fdashboard%2Fgifts")
  })

  it("sends a short notice for security notifications", () => {
    const [email] = buildAuthEmails(payload("password_changed_notification"), { siteUrl: SITE })
    expect(email.subject).toBe("A change to your Majnu account")
    expect(email.text).toContain("password of your Majnu account was changed")
    expect(email.text).not.toContain("/auth/confirm")
  })

  it("escapes addresses in the html", () => {
    const [email] = buildAuthEmails(payload("magiclink", {}, { email: "<b>x</b>@example.com" }), { siteUrl: SITE })
    expect(email.html).not.toContain("<b>x</b>")
    expect(email.html).toContain("&lt;b&gt;x&lt;/b&gt;@example.com")
  })

  it("leaves out a code that is not six digits", () => {
    const [email] = buildAuthEmails(payload("reauthentication", { token: "12ab" }), { siteUrl: SITE })
    expect(email.text).not.toContain("Your code")
  })

  it("refuses unknown types and missing recipients", () => {
    expect(() => buildAuthEmails(payload("sms"), { siteUrl: SITE })).toThrow(UnsupportedEmailError)
    expect(() => buildAuthEmails(payload("magiclink", {}, {}), { siteUrl: SITE })).toThrow(UnsupportedEmailError)
    expect(() => buildAuthEmails(payload("magiclink", { token_hash: "" }), { siteUrl: SITE })).toThrow(UnsupportedEmailError)
  })
})

describe("confirm links", () => {
  it("keeps only a same-site next taken from redirect_to", () => {
    expect(nextFromRedirect(SITE, "https://majnu.app/auth/callback?next=%2Fl%2Fabc")).toBe("/l/abc")
    expect(nextFromRedirect(SITE, "https://majnu.app/dashboard")).toBe("/dashboard")
    expect(nextFromRedirect(SITE, "https://majnu.app/")).toBe("/")
    expect(nextFromRedirect(SITE, "https://evil.example/auth/callback?next=%2Fdashboard")).toBeNull()
    expect(nextFromRedirect(SITE, "https://majnu.app/auth/callback?next=https%3A%2F%2Fevil.example")).toBeNull()
    expect(nextFromRedirect(SITE, "https://majnu.app/auth/callback?next=%2F%2Fevil.example")).toBeNull()
    expect(nextFromRedirect(SITE, "https://majnu.app/signin")).toBeNull()
    expect(nextFromRedirect(SITE, "not a url")).toBeNull()
    expect(nextFromRedirect(SITE, undefined)).toBeNull()
  })

  it("builds the link on our own site without next when there is none", () => {
    expect(confirmLink("https://majnu.app/", { tokenHash: "h", type: "recovery", redirectTo: "https://evil.example" })).toBe(
      "https://majnu.app/auth/confirm?token_hash=h&type=recovery",
    )
  })
})
