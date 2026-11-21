import "server-only"
import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/letters/store"
import { billingEnabled } from "@/lib/limits"

// `isGuest`: an anonymous account made by the gift finder (docs/plan.md, "Gift
// finder"). Guests use the app like everyone else; the shell asks them, quietly,
// to create an account so they keep their gifts.
export type SessionUser = { email: string | null; name: string | null; isGuest: boolean }

// The signed-in user (guests included) for the app shell, or null.
export async function getSignedInUser(): Promise<SessionUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const name = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null
  return { email: user.email ?? null, name, isGuest: user.is_anonymous === true }
}

// True when plans are enforced and the user is on Crescent, so Full moon
// templates show the upgrade state instead of the link. While billing is off
// (the default), everyone gets Full moon features and the profile is not read.
export async function fullMoonLocked(): Promise<boolean> {
  if (!billingEnabled()) return false
  const profile = await getMyProfile()
  return profile.plan === "free"
}
