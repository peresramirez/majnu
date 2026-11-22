"use client"

// A voice note for one gift (issue #38): record up to two minutes, listen
// back, save, record again or remove. The recipient hears it with one tap on
// the gift page ("Tap to hear Sam", components/letters/audio-note.tsx).
//
// Self-contained so it can sit anywhere a gift's id is known: on My gifts,
// after wrapping in the finder, beside the create page's preview. Give it the
// saved note when the page already has it (`initial`); leave it out and it
// asks the server. `onChange` hears about every save and removal, for example
// to reload a preview.
//
// Recording is useVoiceRecorder in its hand-back mode; the states around it
// are in audio-note-model.ts. Nothing is uploaded until "Save". The microphone
// is released as soon as a recording stops or the component goes away.
import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { LoaderCircle, Mic, Pause, Play, RotateCcw, Square, Trash2, X } from "lucide-react"
import { eyebrow, primaryButton, smallButton } from "@/components/app/styles"
import { sentenceStart, verbFor, wholeName } from "@/components/letters/names"
import { MAX_NOTE_SECONDS, NOTE_RECORDING_TYPES, type AudioNoteSummary } from "@/lib/audio/rules"
import { formatSeconds } from "@/lib/voice/rules"
import { initialNoteState, noteApi, noteReducer, noteStatus, savedNote, type NoteApi } from "./audio-note-model"
import { statusMessage, timerLabel } from "./recorder-state"
import { useAudioPlayer } from "./use-audio-player"
import { useVoiceRecorder, type Recording } from "./use-voice-recorder"

type Props = {
  letterId: string
  // The saved note, null for none, or left out to load it.
  initial?: AudioNoteSummary | null
  // "Anna", for "Anna hears it with one tap" ("Our friends hear it"). Optional.
  recipientName?: string | null
  onChange?: (note: AudioNoteSummary | null) => void
  className?: string
  // Replaced on workbench pages and in tests.
  api?: NoteApi
}

const compactPrimary = primaryButton.replace("px-5 py-3 text-[15px]", "px-4 py-2 text-sm")

// A blob: URL for a recording being listened back to, revoked when it changes.
function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

function browserLanguages(): string[] {
  if (typeof navigator === "undefined") return []
  return (navigator.languages?.length ? [...navigator.languages] : [navigator.language]).filter(Boolean)
}

export function AudioNoteRecorder({ letterId, initial, recipientName, onChange, className = "", api = noteApi }: Props) {
  const [state, dispatch] = useReducer(noteReducer, initial, initialNoteState)
  const [mounted, setMounted] = useState(false)
  const mainAction = useRef<HTMLButtonElement>(null)
  // Set by the sender's own actions: the next render moves focus to the next
  // thing to do (the button they pressed is often gone). Never on page load.
  const moveFocus = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const onRecording = useCallback((recording: Recording) => {
    moveFocus.current = true
    dispatch({ type: "recorded", recording })
  }, [])
  const recorder = useVoiceRecorder({ onRecording, maxSeconds: MAX_NOTE_SECONDS, recordingTypes: NOTE_RECORDING_TYPES })
  const recording = recorder.state.phase !== "idle"

  const draft = state.view === "draft" || state.view === "saving" ? state.recording : null
  const draftUrl = useObjectUrl(draft?.blob ?? null)
  const saved = savedNote(state)
  const listenSrc = draft ? draftUrl : saved?.src ?? null
  const player = useAudioPlayer(listenSrc, draft ? draft.seconds : saved?.seconds)
  // The whole name, so "our friends" is not cut to "our" (issue #62).
  const name = recipientName?.trim() ? wholeName(recipientName) : null
  const hearsIt = name ? `${sentenceStart(name)} ${verbFor(name, "hears", "hear")} it` : "They hear it"

  useEffect(() => setMounted(true), [])

  // Load the saved note when the page did not pass it.
  useEffect(() => {
    if (state.view !== "loading") return
    let live = true
    void api.load(letterId).then((outcome) => {
      if (!live) return
      if (outcome.ok) dispatch({ type: "loaded", note: outcome.note })
      else if (outcome.code === "not_a_letter") dispatch({ type: "not_available" })
      else dispatch({ type: "load_failed", message: outcome.message })
    })
    return () => {
      live = false
    }
    // Only on mount: the view leaves "loading" once and never returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recording and listening never overlap.
  const { stop: stopPlayer } = player
  useEffect(() => {
    if (recording) stopPlayer()
  }, [recording, stopPlayer])

  // After the sender's own action, focus moves to the next thing to do, so
  // keyboards and screen readers follow.
  const view = state.view
  const phase = recorder.state.phase
  useEffect(() => {
    if (!moveFocus.current) return
    moveFocus.current = false
    mainAction.current?.focus({ preventScroll: true })
  }, [view, phase])

  function act(event: Parameters<typeof dispatch>[0]) {
    moveFocus.current = true
    dispatch(event)
  }

  async function save() {
    if (state.view !== "draft") return
    const current = state.recording
    player.stop()
    act({ type: "save" })
    const outcome = await api.save(letterId, current, browserLanguages())
    if (outcome.ok && outcome.note) {
      act({ type: "saved", note: outcome.note })
      onChangeRef.current?.(outcome.note)
    } else {
      act({ type: "save_failed", message: outcome.ok ? "The voice note couldn't be saved just now. Try again in a moment." : outcome.message })
    }
  }

  async function remove() {
    if (state.view !== "confirm_remove") return
    player.stop()
    act({ type: "confirm_remove" })
    const outcome = await api.remove(letterId)
    if (outcome.ok) {
      act({ type: "removed" })
      onChangeRef.current?.(null)
    } else {
      act({ type: "remove_failed", message: outcome.message })
    }
  }

  function record() {
    player.stop()
    moveFocus.current = true
    void recorder.start()
  }

  function cancelRecording() {
    moveFocus.current = true
    recorder.cancel()
  }

  const recorderNotice = recorder.state.phase === "idle" ? recorder.state.notice : null
  const recorderError = recorderNotice?.kind === "error" ? recorderNotice.message : null
  const noteNotice = "notice" in state ? state.notice : null
  const noteError = noteNotice?.kind === "error" ? noteNotice.message : null
  // The recorder speaks while recording, on its errors and right after a
  // recording ("Recorded. Listen back, then save it."); the note's own states
  // (saving, saved, removed) speak otherwise.
  const justRecorded = state.view === "draft" && !noteError && recorderNotice?.kind === "recorded"
  const status = recording || recorderError || justRecorded ? statusMessage(recorder.state) : noteStatus(state, name ? sentenceStart(name) : null)
  const canRecord = mounted && recorder.supported
  const busy = state.view === "saving" || state.view === "removing" || state.view === "loading"

  const listenSeconds = player.duration ?? draft?.seconds ?? saved?.seconds ?? 0
  const listenLabel = player.playing
    ? "Pause"
    : draft
      ? `Listen back, ${formatSeconds(listenSeconds)}`
      : `Listen, ${formatSeconds(listenSeconds)}`

  if (state.view === "unavailable") return null

  const listenButton = (ref?: typeof mainAction) => (
    <button
      ref={ref}
      type="button"
      onClick={() => void player.toggle()}
      disabled={!listenSrc}
      aria-label={listenLabel}
      className={`${smallButton} relative overflow-hidden tabular-nums`}
    >
      {player.loading ? (
        <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
      ) : player.playing ? (
        <Pause className="h-4 w-4" fill="currentColor" strokeWidth={0} aria-hidden="true" />
      ) : (
        <Play className="h-4 w-4" fill="currentColor" strokeWidth={0} aria-hidden="true" />
      )}
      <span aria-hidden="true">
        {player.playing || player.current > 0 ? `${formatSeconds(player.current)} / ${formatSeconds(listenSeconds)}` : formatSeconds(listenSeconds)}
      </span>
      <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-[2px] overflow-hidden rounded-full">
        <span
          className="block h-full origin-left bg-night-rose motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-linear"
          style={{ transform: `scaleX(${player.fraction})` }}
        />
      </span>
    </button>
  )

  return (
    <section aria-label="Voice note" className={`border-t border-night-petal/10 pt-4 ${className}`} data-audio-recorder={state.view}>
      <p className={eyebrow}>Voice note{saved && !draft ? ` · ${formatSeconds(saved.seconds)}` : ""}</p>

      {recording ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            ref={mainAction}
            type="button"
            onClick={() => {
              moveFocus.current = true
              recorder.stop()
            }}
            aria-disabled={recorder.state.phase !== "recording" || undefined}
            className={`${compactPrimary}`}
          >
            {recorder.state.phase === "recording" ? (
              <Square className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} aria-hidden="true" />
            ) : (
              <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
            )}
            {recorder.state.phase === "recording" ? "Stop" : "Starting…"}
          </button>
          {recorder.state.phase === "recording" ? (
            <span className="flex h-9 items-center gap-2 rounded-full bg-night-plum/70 px-3 text-sm font-semibold tabular-nums text-night-petal ring-1 ring-inset ring-night-rose/40" aria-hidden="true">
              <span className="h-2 w-2 flex-none rounded-full bg-night-rose motion-safe:animate-pulse" />
              {timerLabel(recorder.state)}
            </span>
          ) : null}
          <button type="button" onClick={cancelRecording} className={smallButton}>
            <X className="h-4 w-4" aria-hidden="true" />
            Cancel
          </button>
        </div>
      ) : state.view === "loading" ? (
        <p className="mt-3 text-sm text-night-lilac">Looking for a voice note…</p>
      ) : state.view === "draft" || state.view === "saving" ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-night-lilac">
            {state.saved ? "Listen back. Saving replaces the note that's there now." : "Listen back, then save it to the gift."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {listenButton()}
            <button
              ref={mainAction}
              type="button"
              onClick={() => void save()}
              aria-disabled={state.view === "saving" || undefined}
              className={compactPrimary}
            >
              {state.view === "saving" ? (
                <>
                  <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                "Save voice note"
              )}
            </button>
            {state.view === "draft" ? (
              <>
                {canRecord ? (
                  <button type="button" onClick={record} className={smallButton}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Record again
                  </button>
                ) : null}
                <button type="button" onClick={() => act({ type: "discard" })} className={smallButton}>
                  Discard
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : saved ? (
        <>
          {saved.caption ? (
            <p className="mt-2 line-clamp-2 text-sm italic leading-relaxed text-night-lilac">&ldquo;{saved.caption}&rdquo;</p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-night-lilac">
              {hearsIt} with one tap on the gift.
            </p>
          )}
          {state.view === "confirm_remove" || state.view === "removing" ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="w-full text-sm text-night-petal">Remove the voice note? The gift stays as it is.</p>
              <button ref={mainAction} type="button" onClick={() => void remove()} aria-disabled={state.view === "removing" || undefined} className={smallButton}>
                {state.view === "removing" ? (
                  <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                )}
                {state.view === "removing" ? "Removing…" : "Remove it"}
              </button>
              {state.view === "confirm_remove" ? (
                <button type="button" onClick={() => act({ type: "keep" })} className={smallButton}>
                  Keep it
                </button>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {listenButton(mainAction)}
              {canRecord ? (
                <button type="button" onClick={record} disabled={busy} className={smallButton}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Record again
                </button>
              ) : null}
              <button type="button" onClick={() => act({ type: "remove" })} disabled={busy} className={smallButton}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed text-night-lilac">
            Record up to {MAX_NOTE_SECONDS / 60} minutes in your own voice. {hearsIt} with one tap on the gift.
          </p>
          <div className="mt-3">
            {canRecord ? (
              <button ref={mainAction} type="button" onClick={record} className={smallButton}>
                <Mic className="h-4 w-4" aria-hidden="true" />
                Record a voice note
              </button>
            ) : mounted ? (
              <p className="text-sm text-night-lilac">This browser can&apos;t record here. Try Chrome or Safari on your phone.</p>
            ) : null}
          </div>
        </>
      )}

      {recorderError || noteError || player.failed ? (
        <p role="alert" className="mt-2.5 text-sm leading-relaxed text-night-rose">
          {recorderError ?? noteError ?? "That couldn't play. Try again."}
        </p>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {recorderError || noteError ? "" : status}
      </span>
    </section>
  )
}
