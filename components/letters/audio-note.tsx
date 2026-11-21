"use client"

// "Tap to hear Sam": the sender's voice note on a gift page (issue #38).
//
// A small pill fixed at the top of the screen, over any template and over a
// Daytona design, so it never meets a template's own button at the bottom
// (the 3D box's "Open your gift"). One tap plays, another pauses; a thin bar
// shows how far it is. Nothing is fetched until the first tap. The audio comes
// from /l/<slug>/audio on our own domain.
//
// Accessible: a real button with a name that says what it does, the caption
// (what was said, from the transcription) linked as its description for
// screen readers, and a live region for play, pause and errors. With reduced
// motion the bar jumps instead of gliding and nothing spins.
import { useId, type CSSProperties } from "react"
import { LoaderCircle, Pause, Play } from "lucide-react"
import { useAudioPlayer } from "@/components/voice/use-audio-player"
import { formatSeconds } from "@/lib/voice/rules"
import type { Theme } from "@/lib/letters/schema"
import { focusRing } from "./chrome"
import { firstName } from "./names"
import { themeStyle } from "./theme"

// What a page passes to <LetterRenderer audio>: the note's URL, its length and
// what was said, if it is known.
export type LetterAudio = { src: string; seconds?: number; caption?: string | null }

// How the button names the sender: as they sign ("Lea and Max", "Mum") when
// that is short, else their first name; null when the letter is not signed.
const MAX_NAME_CHARS = 20

export function senderLabel(senderName: string): string | null {
  const name = senderName.replace(/\s+/g, " ").trim()
  if (!name) return null
  return name.length <= MAX_NAME_CHARS ? name : firstName(name)
}

export function AudioNote({ audio, senderName }: { audio: LetterAudio; senderName: string }) {
  const player = useAudioPlayer(audio.src, audio.seconds)
  const captionId = useId()
  const name = senderLabel(senderName)
  const whose = name ? `${name}'s voice note` : "the voice note"
  const caption = audio.caption?.trim()

  const label = player.playing ? `Pause ${whose}` : name ? `Tap to hear ${name}` : "Tap to hear the voice note"
  const total = player.duration
  const time = player.playing || player.current > 0 ? `${formatSeconds(player.current)} / ${total ? formatSeconds(total) : "–"}` : total ? formatSeconds(total) : ""
  const status = player.failed
    ? "The voice note couldn't play. Check your connection and tap to try again."
    : player.playing
      ? `Playing ${whose}.`
      : player.current > 0
        ? "Paused."
        : ""

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-[max(10px,env(safe-area-inset-top))]"
      data-audio-note=""
    >
      <button
        type="button"
        onClick={() => void player.toggle()}
        aria-label={label}
        aria-describedby={caption ? captionId : undefined}
        className={`pointer-events-auto relative flex h-11 max-w-full items-center gap-2.5 overflow-hidden rounded-full py-1.5 pl-1.5 pr-4 font-sans text-[14px] font-semibold leading-none shadow-[0_10px_30px_-12px_rgba(0,0,0,0.55)] ring-1 ring-inset ring-[var(--line)] transition-transform duration-200 ease-calm motion-safe:hover:-translate-y-px ${focusRing}`}
        style={{ background: "var(--paper)", color: "var(--paper-ink)" } as CSSProperties}
      >
        <span
          aria-hidden="true"
          className="grid h-8 w-8 flex-none place-items-center rounded-full"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
        >
          {player.loading ? (
            <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" />
          ) : player.playing ? (
            <Pause className="h-4 w-4" fill="currentColor" strokeWidth={0} />
          ) : (
            <Play className="ml-0.5 h-4 w-4" fill="currentColor" strokeWidth={0} />
          )}
        </span>
        <span aria-hidden="true" className="truncate">
          {player.playing ? (name ?? "Voice note") : name ? `Tap to hear ${name}` : "Tap to hear the voice note"}
        </span>
        {time ? (
          <span aria-hidden="true" className="flex-none text-[13px] font-medium tabular-nums opacity-70">
            {time}
          </span>
        ) : null}
        <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-[2px] overflow-hidden rounded-full">
          <span
            className="block h-full origin-left motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-linear"
            style={{ background: "var(--accent)", transform: `scaleX(${player.fraction})` }}
          />
        </span>
      </button>
      {caption ? (
        <p id={captionId} className="sr-only">
          {name ? `${name} says: ` : "The note says: "}
          {caption}
        </p>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </div>
  )
}

// The same button over a Daytona design, which runs in a full-screen iframe and
// has no template variables of its own: the letter's palette is set here.
export function AudioNoteOverlay({ audio, senderName, theme }: { audio: LetterAudio; senderName: string; theme: Theme }) {
  return (
    <div style={themeStyle(theme)}>
      <AudioNote audio={audio} senderName={senderName} />
    </div>
  )
}
