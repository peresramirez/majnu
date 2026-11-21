"use client"

// Sends finder messages and turns the streamed events into state (see
// finder-state.ts for what each event does), and wraps a chosen gift.
import { useCallback, useEffect, useReducer, useRef } from "react"
import type { FinderRequest, GiftOption, WrapTemplateId } from "@/lib/finder/events"
import { SessionError } from "./anonymous-session"
import {
  WRAP_ERROR,
  finderReducer,
  initialFinderState,
  wrapReducer,
  type WrapDetails,
  type WrapState,
} from "./finder-state"
import { FinderRequestError, OFFLINE, browserLocale, type FinderTransport } from "./transport"

const MAX_MESSAGE = 1000

export function useFinder(transport: FinderTransport) {
  const [state, dispatch] = useReducer(finderReducer, undefined, initialFinderState)
  const [wrap, dispatchWrap] = useReducer(wrapReducer, { stage: "closed" } as WrapState)
  const sessionRef = useRef<string | null>(null)
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  // Where the Turnstile widget may render, inside the finder dialog.
  const checkHostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const run = useCallback(
    async (message: string) => {
      const controller = new AbortController()
      abortRef.current = controller
      try {
        dispatch({ type: "event", event: { type: "status", label: "Reading your message…" } })
        try {
          await transport.ensureSession(() => checkHostRef.current)
        } catch (error) {
          if (controller.signal.aborted) return
          const signin = error instanceof SessionError && error.code === "anonymous_disabled"
          dispatch({
            type: "failed",
            message: error instanceof SessionError ? error.message : OFFLINE,
            reason: signin ? "signin_required" : undefined,
          })
          return
        }
        const request: FinderRequest = { message, locale: browserLocale() }
        if (sessionRef.current) request.sessionId = sessionRef.current
        for await (const event of transport.stream(request, controller.signal)) {
          if (controller.signal.aborted) return
          if (event.type === "session") sessionRef.current = event.sessionId
          dispatch({ type: "event", event })
        }
        if (!controller.signal.aborted) dispatch({ type: "closed" })
      } catch (error) {
        if (controller.signal.aborted) return
        dispatch({ type: "failed", message: error instanceof FinderRequestError ? error.message : OFFLINE })
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
          busyRef.current = false
        }
      }
    },
    [transport],
  )

  // Returns false when nothing was sent: an empty message, or a reply is still
  // streaming. The message box keeps its text in that case.
  const send = useCallback(
    (raw: string): boolean => {
      const message = raw.trim().slice(0, MAX_MESSAGE)
      if (!message || busyRef.current) return false
      busyRef.current = true
      dispatch({ type: "send", text: message })
      void run(message)
      return true
    },
    [run],
  )

  // A new search from the landing page: forget the conversation and its session.
  const restart = useCallback(
    (raw: string): boolean => {
      if (!raw.trim()) return false
      abortRef.current?.abort()
      abortRef.current = null
      busyRef.current = false
      sessionRef.current = null
      dispatch({ type: "reset" })
      dispatchWrap({ type: "back" })
      return send(raw)
    },
    [send],
  )

  const choose = useCallback((option: GiftOption) => dispatchWrap({ type: "choose", option }), [])
  const chooseTemplate = useCallback((templateId: WrapTemplateId) => dispatchWrap({ type: "template", templateId }), [])
  const backToIdeas = useCallback(() => dispatchWrap({ type: "back" }), [])

  const wrapGift = useCallback(
    async (details: WrapDetails) => {
      if (wrap.stage !== "choose") return
      const sessionId = sessionRef.current
      if (!sessionId) {
        dispatchWrap({ type: "submit" })
        dispatchWrap({ type: "failed", message: "Start a new search, then choose a gift to wrap." })
        return
      }
      const { option, templateId } = wrap
      dispatchWrap({ type: "submit" })
      try {
        const response = await transport.wrap({
          sessionId,
          optionId: option.id,
          templateId,
          recipientName: details.recipientName.trim() || undefined,
          senderName: details.senderName.trim() || undefined,
          note: details.note.trim() || undefined,
        })
        dispatchWrap({ type: "result", response })
      } catch {
        dispatchWrap({ type: "failed", message: WRAP_ERROR })
      }
    },
    [transport, wrap],
  )

  return { state, wrap, send, restart, choose, chooseTemplate, wrapGift, backToIdeas, checkHostRef, transport }
}

export type Finder = ReturnType<typeof useFinder>
