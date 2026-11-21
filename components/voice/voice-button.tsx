"use client"

// The microphone button in a message box (issue #37). Tap to start, tap again
// to stop, or cancel; a recording stops by itself at one minute. The text goes
// to `onText` for the message box, where the sender checks it and sends it
// themselves: nothing is sent automatically.
//
// The stop button is the same element as the microphone button, so keyboard
// focus stays put while recording. Errors show in a small bubble above the
// button; a live region announces every change. Browsers that cannot record
// (no MediaRecorder, or a page that is not on https) never show the button.
import { useEffect, useRef, type KeyboardEvent } from "react"
import { LoaderCircle, Mic, Square, X } from "lucide-react"
import { focusRing } from "@/components/app/styles"
import { statusMessage, timerLabel } from "./recorder-state"
import { useVoiceRecorder, type VoiceRecorderOptions } from "./use-voice-recorder"

type Props = VoiceRecorderOptions & {
  className?: string
}

const roundButton = `grid h-10 w-10 flex-none place-items-center rounded-full transition-colors duration-200 ease-calm ${focusRing}`

export function VoiceButton({ onText, ensureSession, transcribe, className = "" }: Props) {
  const { state, supported, start, stop, cancel, dismiss } = useVoiceRecorder({ onText, ensureSession, transcribe })
  const wrapper = useRef<HTMLDivElement>(null)
  const notice = state.phase === "idle" ? state.notice : null
  const showingError = notice?.kind === "error"

  // The error bubble sits over the message box, so it closes as soon as the
  // sender clicks or tabs anywhere else (it has been announced already).
  useEffect(() => {
    if (!showingError) return
    const away = (event: Event) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) dismiss()
    }
    document.addEventListener("pointerdown", away)
    document.addEventListener("focusin", away)
    return () => {
      document.removeEventListener("pointerdown", away)
      document.removeEventListener("focusin", away)
    }
  }, [showingError, dismiss])

  if (!supported) return null

  const { phase } = state
  const active = phase !== "idle"

  function onToggle() {
    if (phase === "idle") void start()
    else if (phase === "recording") stop()
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape") return
    if (active) cancel()
    else if (notice?.kind === "error") dismiss()
    else return
    e.preventDefault()
  }

  const toggleLabel =
    phase === "recording"
      ? "Stop and use the recording"
      : phase === "transcribing"
        ? "Writing down what you said"
        : phase === "starting"
          ? "Asking for your microphone"
          : "Speak instead of typing"

  return (
    <div ref={wrapper} className={`relative flex flex-none items-center gap-1 ${className}`} onKeyDown={onKeyDown}>
      {notice?.kind === "error" && (
        <div className="absolute bottom-full right-0 z-20 mb-3 flex w-72 max-w-[calc(100vw-3rem)] items-start gap-1 rounded-2xl bg-night-velvet py-2.5 pl-3.5 pr-1.5 text-left text-sm leading-snug text-night-petal shadow-lg shadow-black/40 ring-1 ring-inset ring-night-petal/20">
          <p className="flex-1 pt-0.5">{notice.message}</p>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className={`grid h-7 w-7 flex-none place-items-center rounded-full text-night-lilac hover:bg-night-petal/10 hover:text-night-petal ${focusRing}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {active && (
        <button
          type="button"
          onClick={cancel}
          aria-label="Cancel the recording"
          className={`${roundButton} text-night-lilac hover:bg-night-petal/10 hover:text-night-petal`}
        >
          <X className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      )}

      {phase === "recording" && (
        <span
          aria-hidden="true"
          className="flex h-10 items-center gap-2 rounded-full bg-night-plum/70 px-3 text-sm font-semibold tabular-nums text-night-petal ring-1 ring-inset ring-night-rose/40"
        >
          <span className="h-2 w-2 flex-none rounded-full bg-night-rose motion-safe:animate-pulse" />
          <span className="sm:hidden">{timerLabel(state).split(" / ")[0]}</span>
          <span className="hidden sm:inline">{timerLabel(state)}</span>
        </span>
      )}

      {phase === "transcribing" && (
        <span aria-hidden="true" className="px-1 text-sm text-night-lilac">
          <span className="sm:hidden">Writing…</span>
          <span className="hidden sm:inline">Writing it down…</span>
        </span>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-label={toggleLabel}
        aria-disabled={phase === "starting" || phase === "transcribing" ? true : undefined}
        data-voice-phase={phase}
        className={`${roundButton} ${
          phase === "recording"
            ? "bg-night-petal text-night-plum hover:bg-white"
            : "text-night-lilac hover:bg-night-petal/10 hover:text-night-petal aria-disabled:cursor-wait"
        }`}
      >
        {phase === "recording" ? (
          <Square className="h-4 w-4" fill="currentColor" strokeWidth={0} aria-hidden="true" />
        ) : phase === "transcribing" ? (
          <LoaderCircle className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <Mic className={`h-5 w-5 ${phase === "starting" ? "opacity-60" : ""}`} aria-hidden="true" />
        )}
      </button>

      <span className="sr-only" role="status" aria-live="polite">
        {statusMessage(state)}
      </span>
    </div>
  )
}
