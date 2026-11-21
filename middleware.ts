import type { NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Every path except:
     * - _next/static, _next/image, favicon.ico: build output and icons
     * - auth: the OAuth callback, which sets the session itself
     * - l/: public letter pages, which never read the session
     * - api/open: the open-tracking beacon, which needs no session
     * - api/claim: guests claiming a gift on an invitation, which needs no session
     * - dev/: the template workbench, built from fixtures
     * - static files and images by extension
     */
    "/((?!_next/static|_next/image|favicon.ico|auth|l/|api/open|api/claim|dev/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest|woff2?|mp4|webm)$).*)",
  ],
}
