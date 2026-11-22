"use server"

import { redirect } from "next/navigation"
import { authCallbackUrl } from "@/components/auth/callback-url"
import { createClient } from "@/lib/supabase/server"

// Email sign-in and sign-up run in the browser (components/auth/email-auth.ts),
// so the Turnstile token is checked against the visitor's own network address.

export type GoogleSignInResult = { error: { message: string; code?: string } }

// Continue with Google. `next` is where to land after Google sends the user
// back, for example the gift a guest was making when "Make it unique" (the
// €2.99 personalised wrapper) asked them to create a free account; without
// one, the callback lands on the gift finder. It comes from the browser, so it
// is checked here (only same-site paths) and again in the callback.
//
// A guest (anonymous account) gets Google linked to the guest account
// (linkIdentity), so the same user id, and every gift made as a guest, stays.
// That needs "Allow manual linking" in Supabase; if it is off, or the Google
// account already has a Majnu account, the guest sees why and can choose
// `switchAccount` to sign in to that other account, leaving the guest account
// behind (merging two accounts is a follow-up).
//
// On success this redirects to Google and never returns. On failure it returns
// the error as plain data: errors thrown from server actions lose their
// message in production builds.
export async function signInWithGoogle(next?: string | null, options?: { switchAccount?: boolean }): Promise<GoogleSignInResult> {
  const supabase = await createClient()
  const redirectTo = authCallbackUrl(process.env.NEXT_PUBLIC_SITE_URL ?? "", next)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const linkToGuest = user?.is_anonymous === true && !options?.switchAccount

  const { data, error } = linkToGuest
    ? await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo } })
    : await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } })

  if (error || !data?.url) {
    return { error: { message: error?.message ?? "Google sign-in did not start.", ...(error?.code ? { code: error.code } : {}) } }
  }
  redirect(data.url)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/signin")
}
