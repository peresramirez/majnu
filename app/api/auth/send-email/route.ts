import { handleSendEmailHook } from "@/lib/email/hook"
import { getEmailSender } from "@/lib/email/sender"

// Supabase Auth's Send Email hook. See lib/email/hook.ts and docs/features/auth-emails.md.
export async function POST(request: Request) {
  return handleSendEmailHook(request, {
    secret: process.env.SEND_EMAIL_HOOK_SECRET,
    sender: getEmailSender(),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin,
  })
}
