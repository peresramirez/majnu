"use client"

// The sender's voice note inside a template (issue #83): a round play button
// with a waveform beside it, "A voice note from Sam" above the bars and the
// time on the right. While it plays the bars move with the voice (an
// AnalyserNode, see ./use-voice-note-audio.ts) and the played part of the
// waveform fills with colour as it goes; paused, the bars settle back into a
// gentle resting shape. With reduced motion the bars stay still and only the
// progress moves.
//
// Templates place it with <VoiceNoteSlot />, where it belongs in their own
// story (after the envelope opens, near the message). The renderer fills the
// slot through VoiceNoteProvider; without a voice note the slot renders
// nothing. A template that places no slot keeps the "Tap to hear" pill at the
// top (./audio-note.tsx), as do Daytona designs.
//
// Theming: `tone="paper"` (on a letter sheet or card) or `tone="page"` (on the
// page background) picks colours from the template's palette variables. Any
// of them can be overridden with CSS variables, on the player's `style` or on
// any ancestor: --vp-ink, --vp-muted, --vp-button, --vp-button-ink,
// --vp-played, --vp-bar, --vp-halo, --vp-focus, --vp-surface, --vp-font,
// --vp-font-weight, --vp-font-style and --vp-title-size.
//
// Same rules as the pill: nothing is fetched before the first tap, the audio
// comes only from our own domain, the button is a real button whose name says
// what it does, the caption (what was said) is its description, and a live
// region reports playing, pausing and errors.
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, type CSSProperties, type ReactNode } from "react"
import { LoaderCircle, Pause, Play } from "lucide-react"
import { playbackFraction } from "@/lib/audio/rules"
import type { LetterAudio } from "./audio-note"
import { useReducedMotion } from "./letter-context"
import { useVoiceNoteAudio } from "./use-voice-note-audio"
import {
  BAR_COUNT,
  barBins,
  breathingLevels,
  isOwnAudioSrc,
  loudness,
  restShape,
  seedOf,
  settleLevels,
  stepLevels,
  timeText,
  voiceSender,
  voiceStatus,
  voiceWords,
} from "./voice-player-model"

export type VoicePlayerTone = "paper" | "page"

export type VoicePlayerStyle = {
  tone?: VoicePlayerTone
  // Centre the player in its column (a centred invitation card).
  align?: "start" | "center"
  className?: string
  style?: CSSProperties
}

type VoicePlayerProps = VoicePlayerStyle & { audio: LetterAudio; senderName: string }

const CSS = `
.vp { --_vp-ink: var(--page-ink); --_vp-muted: var(--page-muted); --_vp-button: var(--accent); --_vp-button-ink: var(--accent-ink); --_vp-played: var(--accent); --_vp-bar: color-mix(in srgb, var(--page-ink) 26%, transparent); --_vp-focus: var(--accent);
  color: var(--vp-ink, var(--_vp-ink)); background: var(--vp-surface, transparent); }
.vp[data-tone="paper"] { --_vp-ink: var(--paper-ink); --_vp-muted: var(--paper-muted); --_vp-button: var(--deep); --_vp-button-ink: var(--deep-ink); --_vp-played: var(--paper-accent); --_vp-bar: color-mix(in srgb, var(--paper-ink) 20%, transparent); --_vp-focus: var(--paper-ink); }
.vp-button { background: var(--vp-button, var(--_vp-button)); color: var(--vp-button-ink, var(--_vp-button-ink)); -webkit-tap-highlight-color: transparent; }
.vp-button:focus-visible { outline: 2px solid var(--vp-focus, var(--_vp-focus)); outline-offset: 4px; }
.vp-title { font-family: var(--vp-font, var(--display)); font-weight: var(--vp-font-weight, var(--display-weight)); font-style: var(--vp-font-style, var(--signoff-style)); font-size: var(--vp-title-size, calc(var(--body-size, 18px) * 0.95)); line-height: 1.2; }
.vp-time { color: var(--vp-muted, var(--_vp-muted)); }
.vp-back { color: var(--vp-bar, var(--_vp-bar)); }
.vp-front { color: var(--vp-played, var(--_vp-played)); }
.vp-halo { background: var(--vp-halo, color-mix(in srgb, var(--vp-played, var(--_vp-played)) 45%, transparent)); opacity: 0; }
@media (prefers-reduced-motion: no-preference) {
  .vp[data-playing="true"] .vp-halo { opacity: calc(0.2 + var(--vp-level, 0) * 0.8); transform: scale(calc(1.04 + var(--vp-level, 0) * 0.42)); }
  .vp-halo { transition: opacity 300ms ease-out; }
  .vp-button { transition: transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1); }
  .vp-button:hover { transform: scale(1.05); }
  .vp-button:active { transform: scale(0.95); }
}
`

export function VoicePlayer({ audio, senderName, tone = "page", align = "start", className = "", style }: VoicePlayerProps) {
  const player = useVoiceNoteAudio(audio.src, audio.seconds)
  const reduced = useReducedMotion()
  const captionId = useId()
  const sender = voiceSender(senderName)
  const words = voiceWords(sender, player.playing)
  const caption = audio.caption?.trim()

  const rest = useMemo(() => restShape(seedOf(audio.src)), [audio.src])
  const bins = useMemo(() => barBins(BAR_COUNT, 128), [])
  const root = useRef<HTMLDivElement>(null)
  const back = useRef<HTMLSpanElement>(null)
  const front = useRef<HTMLSpanElement>(null)
  const levels = useRef<number[]>([])
  const level = useRef(0)
  if (levels.current.length !== rest.length) levels.current = rest.slice()

  // Writes the bars, the sweep and the halo straight to the DOM: once a frame
  // while playing, without a React render.
  const draw = useCallback(() => {
    const heights = levels.current
    for (const layer of [back.current, front.current]) {
      if (!layer) continue
      const bars = layer.children
      for (let i = 0; i < bars.length; i++) (bars[i] as HTMLElement).style.height = `${(heights[i] * 100).toFixed(1)}%`
    }
    root.current?.style.setProperty("--vp-level", level.current.toFixed(3))
  }, [])
  const sweep = useCallback((fraction: number) => {
    if (front.current) front.current.style.clipPath = `inset(0 ${((1 - fraction) * 100).toFixed(2)}% 0 0)`
  }, [])

  // The moving waveform. Runs while playing, then until the bars have settled.
  const { playing, sample, position } = player
  useEffect(() => {
    if (reduced) {
      levels.current = rest.slice()
      level.current = 0
      draw()
      return
    }
    let frame = 0
    const tick = (now: number) => {
      if (playing) {
        sweep(position())
        const heard = sample()
        if (heard) {
          const loud = loudness(heard.time)
          stepLevels(levels.current, heard.frequency, loud, rest, bins)
          level.current += (loud - level.current) * 0.3
        } else {
          breathingLevels(levels.current, rest, now / 1000)
          level.current = 0.35 + 0.15 * Math.sin(now / 260)
        }
        draw()
        frame = requestAnimationFrame(tick)
        return
      }
      const settled = settleLevels(levels.current, rest)
      level.current *= 0.8
      draw()
      if (!settled) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, reduced, rest, bins, sample, position, draw, sweep])

  // The sweep when nothing animates it: paused, ended, or with reduced motion.
  const { current, duration, started } = player
  useEffect(() => {
    if (playing && !reduced) return
    sweep(started ? playbackFraction(current, duration) : 0)
  }, [playing, reduced, current, duration, started, sweep])

  const time = timeText(player.current, player.duration, player.started)
  const status = voiceStatus(player, sender)
  const bars = (key: string) =>
    rest.map((h, i) => <span key={`${key}${i}`} className="block w-[3px] rounded-full bg-current" style={{ height: `${(h * 100).toFixed(1)}%` }} />)

  return (
    <div
      ref={root}
      className={`vp flex w-full max-w-[400px] items-center gap-3.5 text-left ${align === "center" ? "mx-auto" : ""} ${className}`}
      style={style}
      data-tone={tone}
      data-playing={player.playing ? "true" : "false"}
      data-voice-player=""
    >
      <style>{CSS}</style>
      <span className="relative flex-none">
        {/* Behind the button: grows and glows with the voice while it plays. */}
        <span aria-hidden="true" className="vp-halo pointer-events-none absolute inset-0 rounded-full" />
        <button
          type="button"
          onClick={player.toggle}
          aria-label={words.action}
          aria-describedby={caption ? captionId : undefined}
          className="vp-button relative grid h-[52px] w-[52px] place-items-center rounded-full shadow-[0_10px_24px_-12px_rgba(0,0,0,0.55)]"
        >
          <span aria-hidden="true" className="grid place-items-center">
            {player.loading ? (
              <LoaderCircle className="h-5 w-5 motion-safe:animate-spin" />
            ) : player.playing ? (
              <Pause className="h-5 w-5" fill="currentColor" strokeWidth={0} />
            ) : (
              <Play className="ml-0.5 h-5 w-5" fill="currentColor" strokeWidth={0} />
            )}
          </span>
        </button>
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="vp-title min-w-0 text-balance">{words.title}</p>
          {time ? (
            <span aria-hidden="true" className="vp-time flex-none font-sans text-[12.5px] font-medium tabular-nums">
              {time}
            </span>
          ) : null}
        </div>
        <span aria-hidden="true" className="relative mt-1.5 block h-[30px]" style={{ contain: "layout paint" }}>
          <span ref={back} className="vp-back absolute inset-0 flex items-center justify-between">
            {bars("b")}
          </span>
          <span ref={front} className="vp-front absolute inset-0 flex items-center justify-between" style={{ clipPath: "inset(0 100% 0 0)" }}>
            {bars("f")}
          </span>
        </span>
      </div>

      {/* `hidden`: read once, as the button's description, not again as text. */}
      {caption ? (
        <p id={captionId} hidden>
          {words.captionLead}
          {caption}
        </p>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </div>
  )
}

// What the renderer hands the templates: the note and who sent it.
export type VoiceNote = { audio: LetterAudio; senderName: string }

const VoiceNoteContext = createContext<VoiceNote | null>(null)

// Set by <LetterRenderer> around a template that places a slot. `note` is
// null without a voice note, and for a note that is not on our own domain.
export function VoiceNoteProvider({ note, children }: { note: VoiceNote | null; children: ReactNode }) {
  const value = note && isOwnAudioSrc(note.audio.src) ? note : null
  return <VoiceNoteContext.Provider value={value}>{children}</VoiceNoteContext.Provider>
}

export function useVoiceNote(): VoiceNote | null {
  return useContext(VoiceNoteContext)
}

// Where a template wants the voice note. Renders nothing without one.
export function VoiceNoteSlot(props: VoicePlayerStyle) {
  const note = useVoiceNote()
  if (!note) return null
  return <VoicePlayer key={note.audio.src} audio={note.audio} senderName={note.senderName} {...props} />
}
