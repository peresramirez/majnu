import { NextResponse } from 'next/server'
import { afterSignInPath } from '@/lib/billing/next-path'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Where to go after sign-in: `next` if it is a path on this site (carried
  // from /signin?plan=full-moon or ?next=...), otherwise the dashboard. Never
  // another site, so the callback cannot be used as an open redirect.
  return NextResponse.redirect(new URL(afterSignInPath(requestUrl.searchParams.get('next')), siteUrl))
} 