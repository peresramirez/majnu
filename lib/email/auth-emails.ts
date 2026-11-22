// The account emails Supabase Auth asks us to send through its Send Email hook
// (app/api/auth/send-email): what each one says, where its link goes, and the
// html and text versions. Pure, so the tests render every kind.
//
// Every link goes to /auth/confirm on our own site with the token hash, never
// to Supabase directly. That route verifies the hash on the server
// (verifyOtp), which works when the email is opened in another browser or a
// mail app, where the PKCE code exchange of /auth/callback cannot finish.
import { safeNextPath } from "@/lib/billing/next-path"

export const EMAIL_FROM = { email: "hello@majnu.app", name: "Majnu" } as const
// The wordmark is a PNG on the live site: many mail apps (Gmail among them) do
// not show SVG images.
export const EMAIL_ASSET_ORIGIN = "https://majnu.app"

// The `email_data` Supabase sends. Field names are Supabase's.
export type HookEmailData = {
  token?: string
  token_hash?: string
  redirect_to?: string
  email_action_type: string
  site_url?: string
  token_new?: string
  token_hash_new?: string
  old_email?: string
}

export type HookUser = { email?: string; new_email?: string }

export type HookPayload = { user: HookUser; email_data: HookEmailData }

export type OutgoingEmail = { to: string; subject: string; html: string; text: string }

// The types /auth/confirm passes to verifyOtp. Supabase uses the hook's
// email_action_type values for these.
export const LINK_TYPES = ["signup", "magiclink", "recovery", "invite", "email_change", "email"] as const
export type LinkType = (typeof LINK_TYPES)[number]

export function isLinkType(value: unknown): value is LinkType {
  return typeof value === "string" && (LINK_TYPES as readonly string[]).includes(value)
}

type Copy = {
  subject: string
  preheader: string
  heading: string
  body: string
  button?: string
}

const COPY: Record<string, Copy> = {
  signup: {
    subject: "Confirm your email for Majnu",
    preheader: "One tap and your account is ready.",
    heading: "Confirm your email",
    body: "Open this link to confirm your email and finish making your Majnu account.",
    button: "Confirm your email",
  },
  magiclink: {
    subject: "Your sign-in link for Majnu",
    preheader: "Sign in without your password.",
    heading: "Sign in to Majnu",
    body: "Open this link to sign in. It works once and expires in an hour.",
    button: "Sign in",
  },
  recovery: {
    subject: "Reset your Majnu password",
    preheader: "Choose a new password for your account.",
    heading: "Choose a new password",
    body: "Someone asked to reset the password for your Majnu account. If it was you, open this link to choose a new one. It works once and expires in an hour.",
    button: "Choose a new password",
  },
  invite: {
    subject: "You're invited to Majnu",
    preheader: "Make a gift for someone you love.",
    heading: "You're invited to Majnu",
    body: "You've been invited to make an account on Majnu, where a short chat becomes a gift made for one person.",
    button: "Accept the invitation",
  },
  email_change_new: {
    subject: "Confirm your new email for Majnu",
    preheader: "Confirm this address for your Majnu account.",
    heading: "Confirm your new email",
    body: "Open this link to use this address for your Majnu account.",
    button: "Confirm this email",
  },
  email_change_current: {
    subject: "Confirm the change to your Majnu email",
    preheader: "Someone asked to change your account's email.",
    heading: "Confirm the change",
    body: "Someone asked to change the email of your Majnu account. If it was you, open this link to confirm it.",
    button: "Confirm the change",
  },
  reauthentication: {
    subject: "Your Majnu verification code",
    preheader: "Enter this code to continue.",
    heading: "Your verification code",
    body: "Enter this code in Majnu to confirm it's you. It expires soon.",
  },
}

// Security notices Supabase can send when they are switched on. No link.
const NOTICES: Record<string, string> = {
  password_changed_notification: "The password of your Majnu account was changed.",
  email_changed_notification: "The email of your Majnu account was changed.",
  phone_changed_notification: "The phone number of your Majnu account was changed.",
  identity_linked_notification: "A new sign-in method was added to your Majnu account.",
  identity_unlinked_notification: "A sign-in method was removed from your Majnu account.",
  mfa_factor_enrolled_notification: "A new verification method was added to your Majnu account.",
  mfa_factor_unenrolled_notification: "A verification method was removed from your Majnu account.",
}

export class UnsupportedEmailError extends Error {}

// The emails one hook call asks for: usually one, two for an email change with
// "Secure email change" on (one to each address).
export function buildAuthEmails(
  payload: HookPayload,
  options: { siteUrl: string; assetOrigin?: string },
): OutgoingEmail[] {
  const { user, email_data: data } = payload
  const type = data.email_action_type
  const render = (to: string | undefined, copy: Copy, link: string | null, code: string | undefined): OutgoingEmail => {
    if (!to) throw new UnsupportedEmailError(`No recipient for ${type}`)
    // The six-digit code goes only in emails without a link (reauthentication):
    // Majnu has no field to type a code into, so beside a link it would only confuse.
    return renderEmail({ to, copy, link, code: link ? undefined : sixDigits(code), assetOrigin: options.assetOrigin ?? EMAIL_ASSET_ORIGIN })
  }
  const link = (tokenHash: string | undefined, linkType: LinkType) => {
    if (!tokenHash) throw new UnsupportedEmailError(`No token hash for ${type}`)
    return confirmLink(options.siteUrl, { tokenHash, type: linkType, redirectTo: data.redirect_to })
  }

  if (type === "email_change") {
    // Supabase's names are reversed for backward compatibility: token_hash_new
    // belongs to the current address (with `token`), token_hash to the new one
    // (with `token_new`).
    if (data.token_hash && data.token_hash_new) {
      return [
        render(user.email, COPY.email_change_current, link(data.token_hash_new, "email_change"), data.token),
        render(user.new_email, COPY.email_change_new, link(data.token_hash, "email_change"), data.token_new),
      ]
    }
    const hash = data.token_hash || data.token_hash_new
    return [render(user.new_email || user.email, COPY.email_change_new, link(hash, "email_change"), data.token || data.token_new)]
  }

  if (type === "reauthentication") return [render(user.email, COPY.reauthentication, null, data.token)]

  if (type in NOTICES) {
    const notice: Copy = {
      subject: "A change to your Majnu account",
      preheader: NOTICES[type],
      heading: "A change to your account",
      body: `${NOTICES[type]} If it was you, there is nothing to do. If it wasn't, reply to this email and we'll help.`,
    }
    return [render(user.email, notice, null, undefined)]
  }

  // "email" is Supabase's name for a sign-in code sent to an existing account.
  const copy = COPY[type === "email" ? "magiclink" : type]
  if (!copy || !isLinkType(type)) throw new UnsupportedEmailError(`Unsupported email type ${type}`)
  return [render(user.email, copy, link(data.token_hash, type), data.token)]
}

// https://majnu.app/auth/confirm?token_hash=...&type=...&next=...
// `next` is where the person was going: taken from redirect_to (the
// emailRedirectTo the form sent, usually /auth/callback?next=/somewhere) when
// it points at this site, and only ever a same-site path.
export function confirmLink(siteUrl: string, { tokenHash, type, redirectTo }: { tokenHash: string; type: LinkType; redirectTo?: string }): string {
  const base = siteUrl.replace(/\/+$/, "")
  const params = new URLSearchParams({ token_hash: tokenHash, type })
  const next = nextFromRedirect(base, redirectTo)
  if (next) params.set("next", next)
  return `${base}/auth/confirm?${params.toString()}`
}

export function nextFromRedirect(siteUrl: string, redirectTo: string | undefined): string | null {
  if (!redirectTo) return null
  let url: URL
  let site: URL
  try {
    url = new URL(redirectTo)
    site = new URL(siteUrl)
  } catch {
    return null
  }
  if (url.origin !== site.origin) return null
  if (url.pathname === "/auth/callback" || url.pathname === "/auth/confirm") return safeNextPath(url.searchParams.get("next"))
  return safeNextPath(`${url.pathname}${url.search}`)
}

function sixDigits(code: string | undefined): string | undefined {
  return code && /^\d{6}$/.test(code) ? code : undefined
}

const C = {
  plum: "#1B1226",
  velvet: "#2A1C3A",
  petal: "#F5EAF1",
  lilac: "#BCA8C4",
  rose: "#EAB394",
}
const DISPLAY = "'Gilda Display', Georgia, 'Times New Roman', serif"
const SANS = "'Hanken Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif"

const IGNORE_LINK = "If you didn't ask for this, you can ignore this email: nothing changes until the link is opened."
const IGNORE_CODE = "If you didn't ask for this, you can ignore this email: nothing changes without the code."

function renderEmail({
  to,
  copy,
  link,
  code,
  assetOrigin,
}: {
  to: string
  copy: Copy
  link: string | null
  code: string | undefined
  assetOrigin: string
}): OutgoingEmail {
  const isNotice = !link && !code
  const ignoreText = link ? IGNORE_LINK : IGNORE_CODE
  const text = [
    copy.heading,
    "",
    copy.body,
    ...(link && copy.button ? ["", `${copy.button}:`, link] : []),
    ...(code ? ["", link ? `Or enter this code: ${code}` : `Your code: ${code}`] : []),
    ...(isNotice ? [] : ["", ignoreText]),
    "",
    "Majnu · https://majnu.app",
  ].join("\n")

  const e = escapeHtml
  const button =
    link && copy.button
      ? `<tr><td style="padding:28px 0 0 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.rose}" style="border-radius:999px;"><a href="${e(link)}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:15px;font-weight:600;line-height:20px;color:${C.plum};text-decoration:none;border-radius:999px;">${e(copy.button)}</a></td></tr></table></td></tr>
<tr><td style="padding:20px 0 0 0;font-family:${SANS};font-size:13px;line-height:20px;color:${C.lilac};">If the button doesn't work, copy this link into your browser:<br><a href="${e(link)}" style="color:${C.petal};word-break:break-all;">${e(link)}</a></td></tr>`
      : ""
  const codeBlock = code
    ? `<tr><td style="padding:24px 0 0 0;font-family:${SANS};font-size:14px;line-height:20px;color:${C.lilac};">${link ? "Or enter this code:" : "Your code:"}</td></tr>
<tr><td style="padding:8px 0 0 0;font-family:${SANS};font-size:28px;font-weight:600;letter-spacing:0.2em;line-height:36px;color:${C.petal};">${e(code)}</td></tr>`
    : ""
  const ignore = isNotice
    ? ""
    : `<tr><td style="padding:28px 0 0 0;font-family:${SANS};font-size:13px;line-height:20px;color:${C.lilac};">${e(ignoreText)}</td></tr>`

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${e(copy.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.plum};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(copy.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.plum}" style="background-color:${C.plum};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
<tr><td style="padding:0 0 24px 4px;"><a href="https://majnu.app" style="text-decoration:none;"><img src="${e(assetOrigin)}/brand/majnu-wordmark-on-dark.png" width="120" height="32" alt="Majnu" style="display:block;border:0;width:120px;height:32px;color:${C.petal};font-family:${DISPLAY};font-size:24px;"></a></td></tr>
<tr><td bgcolor="${C.velvet}" style="background-color:${C.velvet};border-radius:20px;padding:32px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="font-family:${DISPLAY};font-size:28px;font-weight:400;line-height:34px;color:${C.petal};">${e(copy.heading)}</td></tr>
<tr><td style="padding:14px 0 0 0;font-family:${SANS};font-size:16px;line-height:25px;color:${C.petal};">${e(copy.body)}</td></tr>
${button}
${codeBlock}
${ignore}
</table>
</td></tr>
<tr><td style="padding:20px 4px 0 4px;font-family:${SANS};font-size:12px;line-height:18px;color:${C.lilac};">Majnu · <a href="https://majnu.app" style="color:${C.lilac};">majnu.app</a> · Sent to ${e(to)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  return { to, subject: copy.subject, html, text }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}
