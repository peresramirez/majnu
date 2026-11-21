import type { Metadata } from "next"
import { fullMoonLocked } from "@/components/app/session"
import { CreateChat } from "@/components/create/create-chat"

export const metadata: Metadata = { title: "Create a gift" }
export const dynamic = "force-dynamic"

// The Create tab: an empty chat. The first message creates the gift.
export default async function CreatePage() {
  // A fresh key on every visit: after the first message the address is
  // /create/<id>, and tapping Create again must start a new, empty chat.
  return <CreateChat key={crypto.randomUUID()} fullMoonLocked={await fullMoonLocked()} />
}
