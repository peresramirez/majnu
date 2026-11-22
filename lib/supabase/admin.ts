// Service-role Supabase client. It bypasses row-level security, so it is used
// only on the server, only for the reads and writes the security rules in
// docs/plan.md assign to server code: public letters by exact slug, open
// tracking, new letters, the stored chat and plan changes.
import "server-only"
import { createClient } from "@supabase/supabase-js"

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the admin client")
  }
  // A fresh client per call: it holds no session, and on Workers environment
  // values are only guaranteed inside a request.
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
