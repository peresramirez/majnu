import "server-only"
import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/letters/store"
import { billingEnabled } from "@/lib/limits"

export type SessionUser = { email: string | null; name: string | null }

// The signed-in user for the app shell's account menu, or null.
export async function getSignedInUser(): Promise<SessionUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const name = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null
  return { email: user.email ?? null, name }
}

// True when plans are enforced and the user is on Crescent, so Full moon
// templates show the upgrade state instead of the link. While billing is off
// (the default), everyone gets Full moon features and the profile is not read.
export async function fullMoonLocked(): Promise<boolean> {
  if (!billingEnabled()) return false
  const profile = await getMyProfile()
  return profile.plan === "free"
}
