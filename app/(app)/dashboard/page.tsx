import type { Metadata } from "next"
import { CreateChat } from "@/components/create/create-chat"

export const metadata: Metadata = { title: "Letters & invitations" }
export const dynamic = "force-dynamic"

// The letters chat, reached from the Create tab: an empty chat, where the first
// message creates the gift. It stays at /dashboard so every existing link to it
// (emails, "New gift" buttons, the template gallery's ?template=) still works;
// the app itself opens on Find a gift (components/app/tabs.ts).
export default function LettersChatPage() {
  // A fresh key on every visit: after the first message the address is
  // /create/<id>, and opening the letters chat again must start a new, empty chat.
  return <CreateChat key={crypto.randomUUID()} />
}
