"use client"

// Plays one audio file: the voice note on a gift page, or a recording being
// listened back to before it is saved. The element is made on the first tap
// (nothing is fetched before), and stopped and emptied when the source changes
// or the component goes away.
//
// `seconds` is the length the sender's browser measured. Browsers often report
// Infinity as the length of a recorded webm file until it has played to the
// end, so progress uses `seconds` until the browser knows better.
import { useCallback, useEffect, useRef, useState } from "react"
import { knownDuration, playbackFraction } from "@/lib/audio/rules"

export type PlayerState = {
  playing: boolean
  // Waiting for the first bytes after a tap.
  loading: boolean
  current: number
  duration: number | null
  fraction: number
  failed: boolean
}

export function useAudioPlayer(src: string | null, seconds?: number) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [current, setCurrent] = useState(0)
  const [reported, setReported] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  const release = useCallback(() => {
    const element = audio.current
    audio.current = null
    if (!element) return
    element.pause()
    element.removeAttribute("src")
    element.load()
  }, [])

  // A new source starts from the beginning.
  useEffect(() => {
    setPlaying(false)
    setLoading(false)
    setCurrent(0)
    setReported(null)
    setFailed(false)
    return release
  }, [src, release])

  const element = useCallback((): HTMLAudioElement | null => {
    if (!src) return null
    if (audio.current) return audio.current
    const next = new Audio()
    next.preload = "auto"
    next.addEventListener("play", () => setPlaying(true))
    next.addEventListener("pause", () => setPlaying(false))
    next.addEventListener("playing", () => setLoading(false))
    next.addEventListener("waiting", () => setLoading(true))
    next.addEventListener("timeupdate", () => setCurrent(next.currentTime))
    next.addEventListener("durationchange", () => setReported(Number.isFinite(next.duration) ? next.duration : null))
    next.addEventListener("ended", () => {
      setPlaying(false)
      setLoading(false)
      setCurrent(0)
      next.currentTime = 0
    })
    next.addEventListener("error", () => {
      setPlaying(false)
      setLoading(false)
      setFailed(true)
    })
    next.src = src
    audio.current = next
    return next
  }, [src])

  const toggle = useCallback(async () => {
    const player = element()
    if (!player) return
    if (!player.paused) {
      player.pause()
      return
    }
    setFailed(false)
    setLoading(true)
    try {
      await player.play()
    } catch (error) {
      // A pause() during loading rejects play() with AbortError: not a failure.
      if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true)
      setPlaying(false)
    } finally {
      setLoading(false)
    }
  }, [element])

  const stop = useCallback(() => {
    const player = audio.current
    if (!player) return
    player.pause()
    player.currentTime = 0
    setCurrent(0)
  }, [])

  const state: PlayerState = {
    playing,
    loading: loading && !failed,
    current,
    duration: knownDuration(reported, seconds),
    fraction: playbackFraction(current, reported, seconds),
    failed,
  }
  return { ...state, toggle, stop }
}
