"use client"

// Plays the sender's voice note for <VoicePlayer> and lets it listen to the
// sound (issue #83). Nothing exists before the first tap: no element, no
// request, no AudioContext. On that tap, inside the click itself so iPhone
// Safari allows it, it makes the <audio> element and an AudioContext, and
// routes the element through an AnalyserNode to the speakers, so the
// waveform can follow the voice.
//
// Web Audio on an iPhone obeys the silent switch, and plain <audio> does not.
// So it asks for a "playback" audio session (Safari 17 and later), which plays
// through the switch, and on an iPhone or iPad without that API it never
// routes the sound through Web Audio: the note plays from the element as
// before and the waveform breathes instead of following the voice. Whenever
// the analyser cannot be made, playback is unaffected.
import { useCallback, useEffect, useRef, useState } from "react"
import { knownDuration, playbackFraction } from "@/lib/audio/rules"

type Listening = { node: AnalyserNode; frequency: Uint8Array<ArrayBuffer>; time: Uint8Array<ArrayBuffer> }

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } }
type AudioContextWindow = Window & { webkitAudioContext?: typeof AudioContext }

// iPhones and iPads, including iPads that call themselves a Mac.
function isAppleTouch(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export type VoiceNoteAudio = {
  playing: boolean
  // Waiting for sound after a tap.
  loading: boolean
  failed: boolean
  // True from the first tap until the note ends.
  started: boolean
  current: number
  duration: number | null
  toggle: () => void
  // The analyser's latest spectrum and waveform, or null without one.
  sample: () => Listening | null
  // Where playback is now, read from the element (smoother than timeupdate).
  position: () => number
}

export function useVoiceNoteAudio(src: string, seconds?: number): VoiceNoteAudio {
  const element = useRef<HTMLAudioElement | null>(null)
  const context = useRef<AudioContext | null>(null)
  const listening = useRef<Listening | null>(null)
  // Set when Web Audio must not be used here (see above), so it is not retried.
  const unrouted = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [started, setStarted] = useState(false)
  const [current, setCurrent] = useState(0)
  const [reported, setReported] = useState<number | null>(null)

  // Stop and let go of everything when the player goes away. The player is
  // keyed by its source, so a new note gets a new hook.
  useEffect(
    () => () => {
      const el = element.current
      element.current = null
      listening.current = null
      if (el) {
        el.pause()
        el.removeAttribute("src")
        el.load()
      }
      void context.current?.close().catch(() => {})
      context.current = null
    },
    [],
  )

  const ensureElement = useCallback((): HTMLAudioElement => {
    if (element.current) return element.current
    const el = new Audio()
    el.preload = "auto"
    el.addEventListener("play", () => setPlaying(true))
    el.addEventListener("pause", () => setPlaying(false))
    el.addEventListener("playing", () => setLoading(false))
    el.addEventListener("waiting", () => setLoading(true))
    el.addEventListener("timeupdate", () => setCurrent(el.currentTime))
    el.addEventListener("durationchange", () => setReported(Number.isFinite(el.duration) ? el.duration : null))
    el.addEventListener("ended", () => {
      setPlaying(false)
      setLoading(false)
      setStarted(false)
      setCurrent(0)
      el.currentTime = 0
    })
    el.addEventListener("error", () => {
      setPlaying(false)
      setLoading(false)
      setFailed(true)
    })
    el.src = src
    element.current = el
    return el
  }, [src])

  // Runs inside the tap. Makes the AudioContext and the analyser once, or
  // wakes a context the system suspended (a call, another app's audio).
  const listen = useCallback((el: HTMLAudioElement) => {
    const existing = context.current
    if (existing) {
      if (existing.state !== "running") void existing.resume().catch(() => {})
      return
    }
    if (unrouted.current) return
    const Context = window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext
    const session = (navigator as AudioSessionNavigator).audioSession
    if (!Context || (!session && isAppleTouch())) {
      unrouted.current = true
      return
    }
    if (session) {
      try {
        session.type = "playback"
      } catch {
        // Refused: carry on; desktop browsers have no silent switch.
      }
    }
    try {
      const ctx = new Context()
      context.current = ctx
      // Route only a running context: a suspended one would silence the note.
      const connect = () => {
        if (listening.current || ctx.state !== "running" || context.current !== ctx) return
        try {
          const source = ctx.createMediaElementSource(el)
          const node = ctx.createAnalyser()
          node.fftSize = 256
          node.smoothingTimeConstant = 0.55
          source.connect(node)
          node.connect(ctx.destination)
          listening.current = { node, frequency: new Uint8Array(node.frequencyBinCount), time: new Uint8Array(node.fftSize) }
        } catch {
          unrouted.current = true
        }
      }
      if (ctx.state === "running") connect()
      else void ctx.resume().then(connect, () => {})
    } catch {
      unrouted.current = true
      context.current = null
    }
  }, [])

  // Called straight from the click handler: play() must start inside the tap.
  const toggle = useCallback(() => {
    const el = ensureElement()
    if (!el.paused) {
      el.pause()
      return
    }
    setFailed(false)
    setLoading(true)
    setStarted(true)
    listen(el)
    el.play()
      .catch((error: unknown) => {
        // A pause() while loading rejects play() with AbortError: not a failure.
        if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true)
        setPlaying(false)
      })
      .finally(() => setLoading(false))
  }, [ensureElement, listen])

  const sample = useCallback((): Listening | null => {
    const l = listening.current
    if (!l || context.current?.state !== "running") return null
    l.node.getByteFrequencyData(l.frequency)
    l.node.getByteTimeDomainData(l.time)
    return l
  }, [])

  const position = useCallback((): number => {
    const el = element.current
    if (!el) return 0
    return playbackFraction(el.currentTime, Number.isFinite(el.duration) ? el.duration : null, seconds)
  }, [seconds])

  return {
    playing,
    loading: loading && !failed,
    failed,
    started,
    current,
    duration: knownDuration(reported, seconds),
    toggle,
    sample,
    position,
  }
}
