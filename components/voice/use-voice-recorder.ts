"use client"

// Records one message with MediaRecorder and turns it into text through
// POST /api/transcribe. The states and their rules are in recorder-state.ts.
//
// The microphone is released (every track stopped) as soon as a recording
// ends, is cancelled, or the component goes away. The audio lives only in
// memory until it is sent, and nothing is kept afterwards.
import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import {
  MAX_RECORDING_SECONDS,
  RECORDING_BITRATE,
  audioExtension,
  pickRecordingType,
} from "@/lib/voice/rules"
import {
  initialRecorderState,
  isTooShort,
  microphoneErrorCode,
  recorderReducer,
  transcribeOutcome,
  type TranscribeOutcome,
} from "./recorder-state"

export type Transcribe = (form: FormData, signal: AbortSignal) => Promise<TranscribeOutcome>

export const postTranscription: Transcribe = async (form, signal) => {
  let res: Response
  try {
    res = await fetch("/api/transcribe", { method: "POST", body: form, signal, headers: { accept: "application/json" } })
  } catch (error) {
    if (signal.aborted) throw error
    return { ok: false, code: "offline" }
  }
  const body: unknown = await res.json().catch(() => null)
  return transcribeOutcome(res.status, body)
}

export type VoiceRecorderOptions = {
  // Receives the transcript; the caller puts it in the message box.
  onText: (text: string) => void
  // Makes sure there is a session before uploading (the finder's anonymous
  // sign-in). A thrown error's message is shown.
  ensureSession?: () => Promise<void>
  // Replaced on workbench pages, so the button can be shown without the API.
  transcribe?: Transcribe
}

const TICK_MS = 250

function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  )
}

export function useVoiceRecorder({ onText, ensureSession, transcribe = postTranscription }: VoiceRecorderOptions) {
  const [state, dispatch] = useReducer(recorderReducer, initialRecorderState)
  // Known only after mount, so the server and the first render agree.
  const [supported, setSupported] = useState(false)

  // The latest callbacks, so a transcription that finishes after a re-render
  // appends to the current text, not to what the box held when it started.
  const callbacks = useRef({ onText, ensureSession, transcribe })
  callbacks.current = { onText, ensureSession, transcribe }

  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const startedAt = useRef(0)
  const timer = useRef<number | null>(null)
  const upload = useRef<AbortController | null>(null)
  // Bumped by every start and cancel: work from an older attempt is ignored.
  const attempt = useRef(0)

  useEffect(() => setSupported(canRecord()), [])

  const releaseMicrophone = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current)
      timer.current = null
    }
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }, [])

  const send = useCallback(
    async (blob: Blob, seconds: number, mine: number) => {
      const controller = new AbortController()
      upload.current = controller
      try {
        if (callbacks.current.ensureSession) {
          try {
            await callbacks.current.ensureSession()
          } catch (error) {
            if (attempt.current !== mine) return
            const message = error instanceof Error && error.message ? error.message : undefined
            dispatch({ type: "failed", code: "session_required", message })
            return
          }
        }
        if (attempt.current !== mine) return

        const form = new FormData()
        form.append("audio", blob, `recording.${audioExtension(blob.type) ?? "webm"}`)
        form.append("duration", seconds.toFixed(2))
        const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
        for (const language of languages.slice(0, 3)) if (language) form.append("language", language)

        const outcome = await callbacks.current.transcribe(form, controller.signal)
        if (attempt.current !== mine) return
        if (outcome.ok) {
          const text = outcome.text.trim()
          if (text) callbacks.current.onText(text)
          dispatch({ type: "transcribed", text })
        } else {
          dispatch({ type: "failed", code: outcome.code, message: outcome.message })
        }
      } catch {
        if (attempt.current === mine && !controller.signal.aborted) dispatch({ type: "failed", code: "offline" })
      } finally {
        if (upload.current === controller) upload.current = null
      }
    },
    [],
  )

  const stop = useCallback(() => {
    const active = recorder.current
    if (!active || active.state === "inactive") return
    active.stop() // onstop sends the recording
  }, [])

  const start = useCallback(async () => {
    if (!canRecord()) {
      dispatch({ type: "start" })
      dispatch({ type: "start_failed", code: "unsupported" })
      return
    }
    const mine = ++attempt.current
    dispatch({ type: "start" })

    let media: MediaStream
    try {
      media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      })
    } catch (error) {
      if (attempt.current === mine) dispatch({ type: "start_failed", code: microphoneErrorCode(error) })
      return
    }
    if (attempt.current !== mine) {
      // Cancelled while the permission prompt was open.
      media.getTracks().forEach((track) => track.stop())
      return
    }
    stream.current = media

    let next: MediaRecorder
    try {
      const mimeType = pickRecordingType((type) => MediaRecorder.isTypeSupported(type))
      next = new MediaRecorder(media, mimeType ? { mimeType, audioBitsPerSecond: RECORDING_BITRATE } : { audioBitsPerSecond: RECORDING_BITRATE })
    } catch {
      releaseMicrophone()
      dispatch({ type: "start_failed", code: "unsupported" })
      return
    }
    recorder.current = next
    chunks.current = []
    next.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data)
    }
    next.onstop = () => {
      const endedAt = performance.now()
      releaseMicrophone()
      recorder.current = null
      if (attempt.current !== mine) return // cancelled
      const seconds = Math.min((endedAt - startedAt.current) / 1000, MAX_RECORDING_SECONDS)
      dispatch({ type: "stop", at: endedAt })
      if (isTooShort((endedAt - startedAt.current) / 1000)) return
      const type = next.mimeType || chunks.current[0]?.type || "audio/webm"
      const blob = new Blob(chunks.current, { type })
      chunks.current = []
      void send(blob, seconds, mine)
    }
    next.onerror = () => {
      if (attempt.current !== mine) return
      attempt.current++
      releaseMicrophone()
      recorder.current = null
      dispatch({ type: "interrupted" })
    }

    try {
      next.start()
    } catch {
      releaseMicrophone()
      recorder.current = null
      dispatch({ type: "start_failed", code: "unsupported" })
      return
    }
    startedAt.current = performance.now()
    dispatch({ type: "started", at: startedAt.current })
    timer.current = window.setInterval(() => {
      const now = performance.now()
      dispatch({ type: "tick", at: now })
      // The one-minute limit: stop and use what was said.
      if ((now - startedAt.current) / 1000 >= MAX_RECORDING_SECONDS) stop()
    }, TICK_MS)
  }, [releaseMicrophone, send, stop])

  const cancel = useCallback(() => {
    attempt.current++
    upload.current?.abort()
    upload.current = null
    const active = recorder.current
    recorder.current = null
    if (active && active.state !== "inactive") active.stop()
    releaseMicrophone()
    chunks.current = []
    dispatch({ type: "cancel" })
  }, [releaseMicrophone])

  const dismiss = useCallback(() => dispatch({ type: "dismiss" }), [])

  // Leaving the page or closing the finder mid-recording frees the microphone.
  useEffect(
    () => () => {
      attempt.current++
      upload.current?.abort()
      const active = recorder.current
      recorder.current = null
      if (active && active.state !== "inactive") active.stop()
      stream.current?.getTracks().forEach((track) => track.stop())
      if (timer.current !== null) window.clearInterval(timer.current)
    },
    [],
  )

  return { state, supported, start, stop, cancel, dismiss }
}
