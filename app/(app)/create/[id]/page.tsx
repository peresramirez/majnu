import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { fullMoonLocked } from "@/components/app/session"
import { CreateChat } from "@/components/create/create-chat"
import { toDisplayMessages } from "@/lib/agents/display"
import { getMyLetter } from "@/lib/letters/store"

// Generic on purpose: titles end up in browser history and shared screenshots.
export const metadata: Metadata = { title: "Your gift" }
export const dynamic = "force-dynamic"

// An existing gift: the same chat, with its conversation, preview and link.
export default async function GiftChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const letter = await getMyLetter(id)
  if (!letter) notFound()

  // Only what the chat shows goes to the browser. The stored conversation
  // (with thinking blocks) stays on the server.
  return (
    <CreateChat
      key={letter.id}
      fullMoonLocked={await fullMoonLocked()}
      gift={{
        letterId: letter.id,
        slug: letter.slug,
        title: letter.title,
        recipientName: letter.content?.recipientName ?? null,
        hasContent: letter.content !== null,
        kind: letter.kind,
        templateId: letter.templateId,
        messages: toDisplayMessages(letter.chat),
      }}
    />
  )
}
