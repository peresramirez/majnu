// What to tell people when signing in, signing up or upgrading a guest account
// goes wrong. Supabase's messages are written for developers; these say what
// happened and what to do. Pure, so it is unit-tested.

const NO_MERGE = "What you made as a guest stays with the guest account: we can't merge two accounts yet."

// Messages for Supabase Auth error codes (AuthError.code) and for the codes the
// auth callback puts in /signin?auth_error=...
const byCode: Record<string, string> = {
  invalid_credentials: "That email and password don't match. Check them and try again.",
  email_not_confirmed: "Confirm your email first: open the link we sent you, then sign in.",
  user_already_exists: "There's already an account with this email. Sign in instead.",
  email_exists: "There's already an account with this email. Sign in instead.",
  over_request_rate_limit: "Too many attempts. Wait a minute and try again.",
  over_email_send_rate_limit: "We've sent several emails already. Wait a few minutes and try again.",
  captcha_failed: "We couldn't check that you're a person and not a bot. Reload the page and try again.",
  // Supabase: Authentication → Sign In / Providers → "Allow manual linking" is off.
  manual_linking_disabled:
    "Adding Google to a guest account isn't switched on yet. Create your account with email instead: everything you made comes with you.",
  // The Google account already belongs to another Majnu account.
  identity_already_exists: `This Google account already has a Majnu account. You can sign in to it instead. ${NO_MERGE}`,
  // An email link that was already used or is too old.
  otp_expired: "That link has expired or was already used. Sign in, or sign up again to get a new link.",
  // The link worked, but this browser could not finish (for example, the email
  // was opened in another browser or app).
  exchange_failed: "Your link worked, but this browser couldn't finish signing you in. Sign in below to continue.",
  bad_code_verifier: "Your link worked, but this browser couldn't finish signing you in. Sign in below to continue.",
  flow_state_not_found: "Your link worked, but this browser couldn't finish signing you in. Sign in below to continue.",
  flow_state_expired: "That sign-in took too long and expired. Try again.",
  access_denied: "Google sign-in was cancelled. Try again whenever you like.",
  signup_disabled: "New accounts are paused for a moment. Try again later.",
}

// For errors returned by Supabase calls. Errors returned from server actions
// arrive as plain objects, not Error instances, so only `message` and `code`
// are read. An unknown error shows Supabase's own message: it comes from our
// auth server, not from the URL.
export function friendlyAuthError(err: unknown, fallback: string, opts: { guest?: boolean } = {}): string {
  const code = readString(err, "code")
  const message = readString(err, "message")
  let text = (code && byCode[code]) || (message && fromMessage(message)) || message || fallback
  if (opts.guest && (code === "email_exists" || code === "user_already_exists")) text = `${text} ${NO_MERGE}`
  return text
}

// For /signin?auth_error=<code>: only known codes get a specific message.
// Text from the URL is never shown.
export function callbackErrorMessage(code: string | null): string | null {
  if (!code) return null
  return byCode[code] ?? "Something went wrong while signing you in. Try again."
}

// Older Supabase servers send no code with some errors.
function fromMessage(message: string): string | undefined {
  const m = message.toLowerCase()
  if (m.includes("invalid login credentials")) return byCode.invalid_credentials
  if (m.includes("email not confirmed")) return byCode.email_not_confirmed
  if (m.includes("already registered") || m.includes("already been registered")) return byCode.email_exists
  if (m.includes("rate limit")) return byCode.over_request_rate_limit
  if (m.includes("captcha")) return byCode.captcha_failed
  if (m.includes("manual linking")) return byCode.manual_linking_disabled
  if (m.includes("identity is already linked")) return byCode.identity_already_exists
  return undefined
}

function readString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || !(key in value)) return undefined
  const field = (value as Record<string, unknown>)[key]
  return typeof field === "string" && field.length > 0 ? field : undefined
}

// Errors after which a guest is offered "Sign in with Google anyway".
export function offersGoogleAnyway(code: string | null | undefined): boolean {
  return code === "identity_already_exists" || code === "manual_linking_disabled"
}
