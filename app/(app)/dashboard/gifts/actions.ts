"use server"

// Releasing a guest's claim on a gift list (issue #35). Only the letter's owner
// can: releaseClaim() checks ownership with the host's own session before it
// deletes anything. Next.js checks that server actions come from this site.
import { revalidatePath } from "next/cache"
import { releaseClaim } from "@/lib/claims/owner"

export type ReleaseState = { error: string } | null

export async function releaseGiftClaim(_previous: ReleaseState, formData: FormData): Promise<ReleaseState> {
  const letterId = String(formData.get("letterId") ?? "")
  const itemId = String(formData.get("itemId") ?? "")
  try {
    const result = await releaseClaim(letterId, itemId)
    if (result === "signed_out") return { error: "Sign in again to release it." }
    if (result === "not_found") return { error: "This gift list is not yours or no longer exists." }
  } catch (error) {
    console.error("releasing a gift claim failed", error instanceof Error ? error.message : error)
    return { error: "Could not release it. Try again." }
  }
  revalidatePath("/dashboard/gifts")
  return null
}
