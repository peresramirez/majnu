import type { Metadata } from "next"
import { FindInvite } from "@/components/app/find-invite"

export const metadata: Metadata = { title: "Find a gift" }

// The Find a gift tab, first in the app. Kept thin on purpose: when the finder
// component can live in the app, it replaces <FindInvite /> here.
export default function FindPage() {
  return <FindInvite />
}
