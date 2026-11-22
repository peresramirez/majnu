"use client"

// Sends finder messages and turns the streamed events into state (see
// finder-state.ts for what each event does), and wraps a chosen gift.
//
// While the wrap step is open, every message carries the gift and design the
// visitor chose (issue #70), a `fill` event fills the wrap form, and new
// options close the wrap step so the visitor sees them.
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from "react"
import type { FinderRequest, GiftOption, WrapChoice, WrapTemplateId } from "@/lib/finder/events"
import { SessionError } from "./anonymous-session"
import {
  WRAP_ERROR,
  finderReducer,
  initialFinderState,
  wrapChoice,
  wrapReducer,
  wrapRequest,
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
  // The newest state, for callbacks that must not change on every keystroke.
  const wrapRef = useRef(wrap)
  const stateRef = useRef(state)
  useLayoutEffect(() => {
    wrapRef.current = wrap
    stateRef.current = state
  })

  useEffect(() => () => abortRef.current?.abort(), [])

  const run = useCallback(
    async (message: string, choice: WrapChoice | undefined) => {
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
        if (choice && sessionRef.current) request.wrap = choice
        for await (const event of transport.stream(request, controller.signal)) {
          if (controller.signal.aborted) return
          if (event.type === "session") sessionRef.current = event.sessionId
          if (event.type === "fill") dispatchWrap({ type: "fill", fields: event.fields })
          if (event.type === "options") dispatchWrap({ type: "options" })
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
      // The choice as it is now, on the wrap step; nothing otherwise.
      const choice = wrapChoice(wrapRef.current)
      dispatch({ type: "send", text: message })
      void run(message, choice)
      return true
    },
    [run],
  )

  // Back to an empty finder ("New search" in the app's Find a gift tab): stop
  // any reply, and forget the conversation, its session and the gift being wrapped.
  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    busyRef.current = false
    sessionRef.current = null
    dispatch({ type: "reset" })
    dispatchWrap({ type: "back" })
  }, [])

  // A new search from the landing page: forget the conversation and its session.
  const restart = useCallback(
    (raw: string): boolean => {
      if (!raw.trim()) return false
      reset()
      return send(raw)
    },
    [reset, send],
  )

  // Their name is prefilled when the visitor told Majnu one (issue #71).
  const choose = useCallback((option: GiftOption) => {
    const current = stateRef.current
    dispatchWrap({ type: "choose", option, recipientName: current.context?.name, from: current.items.length })
  }, [])
  const chooseTemplate = useCallback((templateId: WrapTemplateId) => dispatchWrap({ type: "template", templateId }), [])
  const nextStep = useCallback(() => dispatchWrap({ type: "next" }), [])
  const previousStep = useCallback(() => dispatchWrap({ type: "previous" }), [])
  const editDetails = useCallback((details: Partial<WrapDetails>) => dispatchWrap({ type: "details", details }), [])
  const backToIdeas = useCallback(() => dispatchWrap({ type: "back" }), [])

  const wrapGift = useCallback(async () => {
    const current = wrapRef.current
    if (current.stage !== "choose") return
    // Step 1 moves on to step 2, and step 2 without a name asks for it; only
    // a complete step 2 is sent.
    if (current.step !== "details" || !current.details.recipientName.trim()) {
      dispatchWrap({ type: "submit" })
      return
    }
    const sessionId = sessionRef.current
    dispatchWrap({ type: "submit" })
    if (!sessionId) {
      dispatchWrap({ type: "failed", message: "Start a new search, then choose a gift to wrap." })
      return
    }
    try {
      const response = await transport.wrap(wrapRequest(sessionId, current))
      dispatchWrap({ type: "result", response })
    } catch {
      dispatchWrap({ type: "failed", message: WRAP_ERROR })
    }
  }, [transport])

  return {
    state,
    wrap,
    send,
    restart,
    reset,
    choose,
    chooseTemplate,
    nextStep,
    previousStep,
    editDetails,
    wrapGift,
    backToIdeas,
    checkHostRef,
    transport,
  }
}

export type Finder = ReturnType<typeof useFinder>
