// The sums behind the voice player (issue #83), kept free of React and the
// DOM so they run on the server, in the browser and in the unit tests.
//
// - Which templates place the player in their own story (VOICE_NOTE_IN_TEMPLATE).
// - The waveform at rest: a gentle, voice-like shape from a seed, the same on
//   the server and in the browser, so hydration never redraws it.
// - The waveform while playing: each bar follows one band of the analyser's
//   spectrum and the overall loudness, rising quickly and settling slowly.
// - The words: "A voice note from Sam", the button's name, the caption's lead,
//   the time left and the live region's status.
import type { LetterTemplateId } from "@/lib/letters/schema"
import { formatSeconds } from "@/lib/voice/rules"
import { shortName, verbFor } from "./names"

// Whether a letter template places <VoiceNoteSlot /> in its own page (true)
// or relies on the "Tap to hear" pill fixed at the top (false). A template
// with a slot gets neither the pill nor the band the pill needs. Typed by
// template id, so a new template has to decide.
export const VOICE_NOTE_IN_TEMPLATE: Record<LetterTemplateId, boolean> = {
  "classic-envelope": true,
  "gift-reveal": true,
  "gift-box-3d": true,
  "party-box": true,
  postcard: true,
  "wedding-invite": true,
  "party-invite": true,
  "treasure-map": true,
  "wedding-envelope-3d": true,
  "wedding-invite-3d": true,
  "party-invite-3d": true,
  "gift-3d": true,
}

// The renderer draws unknown ids as the classic envelope, so they follow it.
export function templateHasVoiceSlot(templateId: string): boolean {
  return VOICE_NOTE_IN_TEMPLATE[templateId as LetterTemplateId] ?? VOICE_NOTE_IN_TEMPLATE["classic-envelope"]
}

// The note must come from our own domain: a path on this site, never another
// origin ("//evil.example", "https://…"), a data: or a blob: URL.
export function isOwnAudioSrc(src: string | null | undefined): src is string {
  return typeof src === "string" && /^\/(?![/\\])/.test(src) && !/[\s\\]/.test(src)
}

export const BAR_COUNT = 34

// The quietest a bar gets, so the waveform never collapses into a line.
export const MIN_LEVEL = 0.12

// A small, fast, seeded generator (mulberry32): the same seed gives the same
// numbers everywhere.
function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// FNV-1a over the text: a seed from the note's URL, so each note rests in a
// shape of its own.
export function seedOf(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const round = (n: number) => Math.round(n * 1000) / 1000

// The waveform at rest: soft phrases of speech that swell and fall, a little
// lower at both ends. Values from MIN_LEVEL to 0.92, rounded so the server's
// markup and the browser's first render are identical.
export function restShape(seed: number, count = BAR_COUNT): number[] {
  const random = seededRandom(seed)
  const raw = Array.from({ length: count }, () => random())
  // Two passes of a three-bar average turn noise into phrases.
  let smooth = raw
  for (let pass = 0; pass < 2; pass++) {
    smooth = smooth.map((_, i) => {
      const a = smooth[Math.max(0, i - 1)]
      const b = smooth[i]
      const c = smooth[Math.min(count - 1, i + 1)]
      return (a + 2 * b + c) / 4
    })
  }
  // Stretch back to the full range, which the averaging flattened.
  const low = Math.min(...smooth)
  const span = Math.max(...smooth) - low || 1
  smooth = smooth.map((v) => (v - low) / span)
  const phrase = 1.7 + random() * 0.8
  return smooth.map((v, i) => {
    const x = count > 1 ? i / (count - 1) : 0.5
    const ends = 0.55 + 0.45 * Math.sin(Math.PI * x)
    const swell = 0.75 + 0.25 * Math.sin(x * Math.PI * 2 * phrase + seed % 7)
    const level = MIN_LEVEL + (0.92 - MIN_LEVEL) * Math.min(1, Math.max(0, (0.12 + 0.88 * v) * ends * swell))
    return round(level)
  })
}

// Which spectrum bin each bar listens to. Voices sit low in the spectrum, so
// the bins are spread over the low part, a little more densely at the bottom,
// and dealt out in a scattered order so neighbouring bars move differently,
// like a waveform rather than an equaliser.
export function barBins(count: number, binCount: number): number[] {
  const top = Math.max(2, Math.min(binCount - 1, Math.round(binCount * 0.42)))
  const bins = Array.from({ length: count }, (_, i) => {
    const x = count > 1 ? i / (count - 1) : 0
    return Math.max(1, Math.min(top, Math.round(1 + Math.pow(x, 1.35) * (top - 1))))
  })
  const random = seededRandom(count * 7919 + binCount)
  for (let i = bins.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[bins[i], bins[j]] = [bins[j], bins[i]]
  }
  return bins
}

// Loudness from the analyser's waveform (bytes around 128): the root mean
// square, scaled so ordinary speech reaches about 0.6 to 1.
export function loudness(timeDomain: ArrayLike<number>): number {
  if (!timeDomain.length) return 0
  let sum = 0
  for (let i = 0; i < timeDomain.length; i++) {
    const v = (timeDomain[i] - 128) / 128
    sum += v * v
  }
  return Math.min(1, Math.sqrt(sum / timeDomain.length) * 3.2)
}

// One frame of the moving waveform. Each bar's target mixes its own band of
// the spectrum with the overall loudness, shaped a little by its resting
// height so the waveform keeps its character. Bars rise fast (attack) and
// settle more slowly (release), which reads as speech rather than flicker.
// Writes into `levels` and returns it.
export function stepLevels(
  levels: number[],
  frequency: ArrayLike<number>,
  loud: number,
  rest: readonly number[],
  bins: readonly number[],
): number[] {
  for (let i = 0; i < levels.length; i++) {
    const band = (frequency[bins[i]] ?? 0) / 255
    const character = 0.55 + 0.45 * rest[i]
    const energy = Math.min(1, (0.6 * Math.pow(band, 1.4) + 0.5 * loud) * character * 1.15)
    const target = MIN_LEVEL + (1 - MIN_LEVEL) * energy
    levels[i] += (target - levels[i]) * (target > levels[i] ? 0.55 : 0.18)
  }
  return levels
}

// One frame when the browser gives no analyser (older iPhones, an
// AudioContext that would not start): the bars breathe around their resting
// shape so the player still looks alive, though not in time with the voice.
export function breathingLevels(levels: number[], rest: readonly number[], seconds: number): number[] {
  for (let i = 0; i < levels.length; i++) {
    const wave = 0.5 + 0.5 * Math.sin(seconds * (5.2 + (i % 5) * 0.9) + i * 1.7)
    const target = Math.max(MIN_LEVEL, Math.min(1, rest[i] * (0.55 + 0.6 * wave)))
    levels[i] += (target - levels[i]) * 0.2
  }
  return levels
}

// Eases the bars back towards rest after a pause. Returns true once every bar
// is there, so the animation can stop.
export function settleLevels(levels: number[], rest: readonly number[]): boolean {
  let done = true
  for (let i = 0; i < levels.length; i++) {
    levels[i] += (rest[i] - levels[i]) * 0.16
    if (Math.abs(levels[i] - rest[i]) > 0.004) done = false
    else levels[i] = rest[i]
  }
  return done
}

// How the player names the sender: the first name of one person ("Sam
// Taylor" -> "Sam"), the whole phrase for a group ("Lea and Max"), or null
// when the letter is not signed.
export function voiceSender(senderName: string | null | undefined): string | null {
  return senderName?.trim() ? shortName(senderName) : null
}

export type VoiceWords = {
  // Shown beside the button.
  title: string
  // The button's accessible name, which says what a tap does.
  action: string
  // Read before the caption, as the button's description.
  captionLead: string
}

export function voiceWords(sender: string | null, playing: boolean): VoiceWords {
  const note = sender ? `the voice note from ${sender}` : "the voice note"
  return {
    title: sender ? `A voice note from ${sender}` : "A voice note",
    action: `${playing ? "Pause" : "Play"} ${note}`,
    captionLead: sender ? `${sender} ${verbFor(sender, "says", "say")}: ` : "The note says: ",
  }
}

// What the time shows: the length before it starts, the time left once it has.
export function timeText(current: number, duration: number | null, started: boolean): string {
  if (!duration) return started ? formatSeconds(current) : ""
  if (!started) return formatSeconds(duration)
  return `-${formatSeconds(Math.max(0, Math.ceil(duration - current)))}`
}

// The live region's words. Empty before the first tap.
export function voiceStatus(state: { playing: boolean; failed: boolean; started: boolean }, sender: string | null): string {
  if (state.failed) return "The voice note couldn't play. Check your connection and tap to try again."
  if (state.playing) return `Playing the voice note${sender ? ` from ${sender}` : ""}.`
  return state.started ? "Paused." : ""
}
