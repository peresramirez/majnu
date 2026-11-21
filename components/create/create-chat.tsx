"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { Eye, Plus } from "lucide-react"
import { getGiftLinkInfo } from "@/app/(app)/create/actions"
import { MoonPhase } from "@/components/brand/moon-phase"
import { focusRing, smallButton } from "@/components/app/styles"
import type { DisplayMessage } from "@/lib/agents/events"
import type { LetterKind, TemplateId } from "@/lib/letters/schema"
import { getTemplate, type TemplateMeta } from "@/lib/letters/templates"
import { composeMessage } from "./chat-state"
import { ChatMessages, EmptyState } from "./chat-messages"
import { Composer } from "./composer"
import { PreviewPane } from "./preview-pane"
import { TemplatePicker } from "./template-picker"
import { useLetterChat } from "./use-letter-chat"

export type ExistingGift = {
  letterId: string
  slug: string
  title: string | null
  recipientName: string | null
  hasContent: boolean
  kind: LetterKind
  templateId: TemplateId | null
  messages: DisplayMessage[]
}

// The Create tab. /dashboard renders it empty; /create/[id] renders it with a
// gift that already exists. The first message of a new gift moves the address
// to /create/<id> without reloading (see use-letter-chat.ts).
export function CreateChat({ gift, fullMoonLocked = false }: { gift?: ExistingGift; fullMoonLocked?: boolean }) {
  const router = useRouter()
  const chat = useLetterChat({
    letterId: gift?.letterId,
    messages: gift?.messages,
    hasContent: gift?.hasContent,
    kind: gift?.kind,
    templateId: gift?.templateId,
  })
  const [link, setLink] = useState({
    slug: gift?.slug ?? null,
    title: gift?.title ?? null,
    recipientName: gift?.recipientName ?? null,
  })
  const [linkFailed, setLinkFailed] = useState(false)
  const [draft, setDraft] = useState("")
  const [template, setTemplate] = useState<TemplateMeta | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Phones show the chat or the preview, one at a time.
  const [view, setView] = useState<"chat" | "preview">("chat")
  const [unseenPreview, setUnseenPreview] = useState(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedToBottom = useRef(true)

  const { letterId, previewVersion, items, streaming, status, hasContent } = chat
  const started = items.length > 0 || letterId !== null
  const templateMeta = chat.templateId ? getTemplate(chat.templateId) : undefined
  const locked = fullMoonLocked && templateMeta?.plan === "full-moon"

  // Coming back here with the browser's Back button can restore this new-gift
  // screen at a /create/<id> address. Load that gift properly instead.
  useEffect(() => {
    if (gift) return
    if (/^\/create\/[^/]+$/.test(window.location.pathname)) router.replace(window.location.pathname)
    // Only on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The events carry only the letter id; fetch the link and name once the gift
  // exists, and again after each rebuild in case the recipient changed.
  useEffect(() => {
    if (!letterId || (link.slug && previewVersion === 0)) return
    let cancelled = false
    getGiftLinkInfo(letterId)
      .catch(() => null)
      .then((info) => {
        if (cancelled) return
        if (info) setLink(info)
        setLinkFailed(!info)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letterId, previewVersion])

  // A rebuilt page on a phone, while the chat is showing: mark the Preview button.
  useEffect(() => {
    if (previewVersion > 0 && view === "chat") setUnseenPreview(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewVersion])

  // Follow the conversation unless the person has scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current
    if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight
  }, [items, status, streaming, view])

  // Stay at the bottom when the chat area changes size: the tab bar coming
  // back after typing, or a phone keyboard opening and closing.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      if (pinnedToBottom.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const chatSend = chat.send
  const send = useCallback(
    (text: string) => {
      pinnedToBottom.current = true
      return chatSend(text)
    },
    [chatSend],
  )

  function sendDraft() {
    if (send(composeMessage(template?.name ?? null, draft))) {
      setDraft("")
      setTemplate(null)
    }
  }

  function chooseTemplate(t: TemplateMeta) {
    setTemplate(t)
    setPickerOpen(false)
    // Wait for the sheet to hand focus back, then put the cursor in the message.
    setTimeout(() => composerRef.current?.focus(), 0)
  }

  function showPreview() {
    setView("preview")
    setUnseenPreview(false)
  }

  const heading = link.recipientName ? `For ${link.recipientName}` : link.title ?? "New gift"

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(420px,36%)]">
      <section aria-label="Chat with Majnu" className={`flex min-h-0 flex-col ${view === "preview" ? "max-lg:hidden" : ""}`}>
        {started && (
          <div className="flex flex-none items-center gap-3 border-b border-night-petal/10 px-4 py-2.5 sm:px-6">
            <MoonPhase lit={hasContent ? 1 : 0.3} size={22} className="flex-none text-night-rose" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-semibold leading-tight text-night-petal">{heading}</h1>
              <p className="truncate text-[13px] text-night-lilac">
                {templateMeta && <span className="max-sm:hidden">{templateMeta.name} · </span>}
                {hasContent ? "Ready to send" : "In progress"}
              </p>
            </div>
            {hasContent && (
              <button type="button" onClick={showPreview} className={`relative lg:hidden ${smallButton}`}>
                <Eye className="h-4 w-4" aria-hidden="true" />
                Preview
                {unseenPreview && (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-night-orchid ring-2 ring-night-plum">
                    <span className="sr-only">(updated)</span>
                  </span>
                )}
              </button>
            )}
            {letterId && (
              <Link
                href="/dashboard"
                aria-label="Start a new gift"
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-2 text-sm font-semibold text-night-lilac transition-colors duration-200 ease-calm hover:text-night-petal ${focusRing}`}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">New gift</span>
              </Link>
            )}
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget
            pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96
          }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-6 sm:px-6">
            {items.length === 0 ? (
              <EmptyState onPick={send} disabled={streaming} />
            ) : (
              <ChatMessages items={items} streaming={streaming} status={status} onSend={send} />
            )}
          </div>
        </div>

        <div className="flex-none px-3 pb-3 pt-1 sm:px-6 md:pb-5">
          <div className="mx-auto max-w-2xl">
            <Composer
              ref={composerRef}
              value={draft}
              onChange={setDraft}
              onSend={sendDraft}
              busy={streaming}
              template={template}
              onRemoveTemplate={() => {
                setTemplate(null)
                composerRef.current?.focus()
              }}
              onOpenTemplates={() => setPickerOpen(true)}
              placeholder={started ? "Reply to Majnu" : "Who is it for, and what's the occasion?"}
            />
            <p className="mt-2 hidden text-center text-xs text-night-lilac/70 md:block">Enter to send. Shift and Enter for a new line.</p>
          </div>
        </div>
      </section>

      <PreviewPane
        className={view === "preview" ? "flex" : "hidden lg:flex"}
        letterId={letterId}
        slug={link.slug}
        linkFailed={linkFailed}
        hasContent={hasContent}
        version={previewVersion}
        recipientName={link.recipientName}
        locked={locked}
        onUnlock={() => router.push("/dashboard/plan")}
        onBack={() => setView("chat")}
      />

      <TemplatePicker open={pickerOpen} onOpenChange={setPickerOpen} selectedId={template?.id ?? null} onChoose={chooseTemplate} />
    </div>
  )
}
