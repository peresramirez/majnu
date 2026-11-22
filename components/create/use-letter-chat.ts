"use client"

// Sends a message to POST /api/chat and turns the streamed events into chat
// state (see chat-state.ts for what each event does to the screen) and the
// live draft of the page (draft-state.ts).
import { useCallback, useEffect, useReducer, useRef } from "react"
import type { ChatRequest } from "@/lib/agents/events"
import { chatReducer, initialChatState, type ChatInit } from "./chat-state"
import { draftReducer, initialDraftState } from "./draft-state"
import { readChatEvents } from "./ndjson"

const OFFLINE = "Your message didn't reach Majnu. Check your connection and try again."

function failureMessage(status: number): string {
  if (status === 401 || status === 403) return "You're signed out. Sign in again to keep going."
  if (status === 404) return "This gift isn't available any more. Start a new one from Create."
  if (status === 429) return "That's a lot of messages at once. Wait a minute, then try again."
  return "Something went wrong sending your message. Try again."
}

function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

export function useLetterChat(init: ChatInit) {
  const [state, dispatch] = useReducer(chatReducer, init, initialChatState)
  const [draftState, dispatchDraft] = useReducer(draftReducer, initialDraftState)
  const letterIdRef = useRef<string | null>(init.letterId ?? null)
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  // Leaving the page stops the download; the server keeps what it has saved.
  useEffect(() => () => abortRef.current?.abort(), [])

  const stream = useCallback(async (message: string) => {
    const controller = new AbortController()
    abortRef.current = controller
    const request: ChatRequest = { message, timezone: browserTimezone() }
    if (letterIdRef.current) request.letterId = letterIdRef.current

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify(request),
        signal: controller.signal,
      })
      // A limit or error may arrive as an event even on an error status.
      const isStream = (res.headers.get("content-type") ?? "").includes("ndjson")
      if (!res.body || (!res.ok && !isStream)) {
        dispatch({ type: "failed", message: failureMessage(res.status) })
        dispatchDraft({ type: "ended" })
        return
      }
      for await (const event of readChatEvents(res.body)) {
        if (event.type === "letter" || event.type === "preview") {
          const isNew = event.type === "letter" && letterIdRef.current !== event.letterId
          letterIdRef.current = event.letterId
          // The first message created the gift: give it its own address without
          // a navigation, so the reply keeps streaming.
          if (isNew) window.history.replaceState(null, "", `/create/${encodeURIComponent(event.letterId)}`)
        }
        dispatch({ type: "event", event })
        dispatchDraft({ type: "event", event })
      }
      dispatch({ type: "closed" })
      dispatchDraft({ type: "ended" })
    } catch {
      if (!controller.signal.aborted) dispatch({ type: "failed", message: OFFLINE })
      dispatchDraft({ type: "ended" })
    } finally {
      busyRef.current = false
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [])

  // Returns false when nothing was sent: an empty message, or a reply is still
  // streaming. The composer keeps its text in that case.
  const send = useCallback(
    (raw: string): boolean => {
      const message = raw.trim()
      if (!message || busyRef.current) return false
      busyRef.current = true
      dispatch({ type: "send", text: message })
      void stream(message)
      return true
    },
    [stream],
  )

  // The preview pane calls this once the reloaded preview is on screen, so the
  // saved draft it was showing in the meantime can go.
  const previewShown = useCallback(() => dispatchDraft({ type: "shown" }), [])

  return { ...state, send, draft: draftState.draft, draftChanges: draftState.changes, previewShown }
}
