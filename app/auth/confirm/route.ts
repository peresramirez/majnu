import { NextResponse } from "next/server"
import { signInErrorPath } from "@/components/auth/callback-url"
import { afterAuthPath } from "@/app/auth/destination"
import { isLinkType } from "@/lib/email/auth-emails"
import { createClient } from "@/lib/supabase/server"

// Where the links in Majnu's account emails land (lib/email/auth-emails.ts):
// /auth/confirm?token_hash=...&type=...&next=...
//
// The token hash is checked on the server with verifyOtp, which signs this
// browser in. Unlike the PKCE code exchange in /auth/callback this needs
// nothing stored in the browser that asked for the email, so a link opened in
// another browser or a mail app works too.
//
// A password-reset link goes on to /reset-password to choose the new password;
// the others to `next` (same-site paths only) or the gift finder.
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin
  const params = requestUrl.searchParams
  const next = params.get("next")
  const tokenHash = params.get("token_hash")
  const type = params.get("type")

  if (!tokenHash || !isLinkType(type)) return NextResponse.redirect(new URL(signInErrorPath("otp_expired", next), siteUrl))

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error) return NextResponse.redirect(new URL(signInErrorPath(error.code ?? "otp_expired", next), siteUrl))

  if (type === "recovery") return NextResponse.redirect(new URL("/reset-password", siteUrl))
  return NextResponse.redirect(new URL(afterAuthPath(next), siteUrl))
}
