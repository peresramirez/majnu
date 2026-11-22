import { NextResponse } from "next/server"
import { signInErrorPath } from "@/components/auth/callback-url"
import { createClient } from "@/lib/supabase/server"
import { afterAuthPath } from "@/app/auth/destination"

// Supabase sends the browser here after Google sign-in, after Google is linked
// to a guest account, and from email links (a guest confirming the address
// that turns their guest account into a real one).
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin
  const params = requestUrl.searchParams
  const next = params.get("next")

  // Supabase reports a refused sign-in or link in the query, for example
  // identity_already_exists when the Google account already has a Majnu
  // account. The sign-in page explains it; only a known code is passed on.
  const failed = params.get("error_code") || params.get("error")
  if (failed) return NextResponse.redirect(new URL(signInErrorPath(failed, next), siteUrl))

  const code = params.get("code")
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    // Usually an email link opened in another browser or a mail app, which
    // lacks this flow's code verifier (Supabase then says validation_failed).
    // The link itself worked; signing in finishes it.
    if (error) {
      const reason = error.code === "flow_state_expired" ? error.code : "exchange_failed"
      return NextResponse.redirect(new URL(signInErrorPath(reason, next), siteUrl))
    }
  }

  // Where to go after sign-in: `next` if it is a path on this site (carried
  // from /signin?next=..., for example back to a gift after "Make it unique"
  // asked a guest to create an account), otherwise the gift finder. Never
  // another site, so the callback cannot be used as an open redirect.
  return NextResponse.redirect(new URL(afterAuthPath(next), siteUrl))
}
