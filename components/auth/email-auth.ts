// Email sign-in and sign-up, run in the browser with the Supabase browser
// client. They run in the browser, not in a server action, because of the bot
// check: Supabase passes the caller's network address to Cloudflare Turnstile
// with the token, and from a server action that would be our Worker's address
// instead of the visitor's.
//
// A guest (anonymous account, docs/plan.md "Gift finder") who signs up is not
// given a new account: the email and password are added to the guest account,
// so its user id, and with it every gift and finder session, stays the same.
// Supabase sends a confirmation link to the new address; until it is opened the
// account stays a guest account.
import type { SupabaseClient } from "@supabase/supabase-js"

type Auth = Pick<SupabaseClient["auth"], "getUser" | "signInWithPassword" | "signUp" | "updateUser">

export type AuthFailure = { message: string; code?: string }

export type SignInResult = { ok: true } | { ok: false; error: AuthFailure }

export type SignUpResult =
  // signed_in: there is a session now. confirm_email: a link was sent first.
  | { ok: true; status: "signed_in" | "confirm_email"; upgradedGuest: boolean }
  | { ok: false; error: AuthFailure; upgradedGuest: boolean }

type Credentials = { email: string; password: string; captchaToken?: string }

// Sign in to an existing account. A guest who does this leaves the guest
// account behind (the form warns them first); merging is a follow-up.
export async function signInWithEmail(auth: Auth, { email, password, captchaToken }: Credentials): Promise<SignInResult> {
  const { error } = await auth.signInWithPassword({ email, password, options: captchaOptions(captchaToken) })
  return error ? { ok: false, error: toFailure(error) } : { ok: true }
}

// Create an account, or turn the current guest account into one.
// `confirmUrl` is where the confirmation link for a guest lands: the auth
// callback, which signs this browser in and continues to `next`.
export async function signUpWithEmail(
  auth: Auth,
  { email, password, captchaToken, confirmUrl }: Credentials & { confirmUrl: string },
): Promise<SignUpResult> {
  // getUser() asks Supabase Auth rather than trusting the stored session.
  const {
    data: { user },
  } = await auth.getUser()

  if (user?.is_anonymous === true) {
    // No captcha here: this is a request for an account that already exists.
    const { data, error } = await auth.updateUser({ email, password }, { emailRedirectTo: confirmUrl })
    if (error) return { ok: false, error: toFailure(error), upgradedGuest: true }
    // With "Confirm email" off in Supabase the address is set at once;
    // otherwise it waits in `new_email` until the link is opened.
    return { ok: true, status: data.user?.email ? "signed_in" : "confirm_email", upgradedGuest: true }
  }

  const { data, error } = await auth.signUp({ email, password, options: captchaOptions(captchaToken) })
  if (error) return { ok: false, error: toFailure(error), upgradedGuest: false }
  return { ok: true, status: data.session ? "signed_in" : "confirm_email", upgradedGuest: false }
}

// Without a Turnstile site key (local tests, or before the widget exists) the
// forms send no token, which works as long as captcha protection is off in Supabase.
function captchaOptions(captchaToken: string | undefined) {
  return captchaToken ? { captchaToken } : undefined
}

function toFailure(error: { message: string; code?: string }): AuthFailure {
  return error.code ? { message: error.message, code: error.code } : { message: error.message }
}
