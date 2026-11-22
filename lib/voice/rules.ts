// Voice input (issue #37): the rules shared by the microphone button and
// POST /api/transcribe. No server-only code here, so the browser can import it.
// See docs/features/voice-input.md.

// One recording is at most a minute: long enough to describe someone, short
// enough that a transcription stays quick and cheap.
export const MAX_RECORDING_SECONDS = 60

// Below this, a tap on the microphone was almost certainly a slip.
export const MIN_RECORDING_SECONDS = 0.5

// A minute of webm/opus is about 0.5 MB at the bitrate the button asks for; iOS
// Safari's mp4/AAC can be two to four times that. 4 MB leaves room for both.
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024

// The bitrate the button asks MediaRecorder for. Speech needs little; browsers
// may ignore it.
export const RECORDING_BITRATE = 48_000

// Per user per UTC day, counted in the voice_transcriptions table
// (supabase/migrations/0005_voice.sql). The site-wide daily cap comes from
// MAJNU_DAILY_VOICE_CAP (lib/voice/usage.ts).
export const VOICE_LIMITS = {
  recordingsPerDay: 20,
  secondsPerDay: 10 * 60,
  siteRecordingsPerDayDefault: 1000,
} as const

// What MediaRecorder is asked for, in order. OpenAI's transcription endpoint
// reads webm and mp4 (not ogg): Chrome, Android, Firefox and Safari 18.4+
// record webm/opus, older iOS Safari only mp4/AAC.
export const RECORDING_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4"] as const

// The first type this browser can record, or "" to let it choose. Voice notes
// in gifts (lib/audio/rules.ts) pass their own order.
export function pickRecordingType(isTypeSupported: (type: string) => boolean, types: readonly string[] = RECORDING_TYPES): string {
  for (const type of types) {
    try {
      if (isTypeSupported(type)) return type
    } catch {
      // Some browsers throw for types they do not know.
    }
  }
  return ""
}

// The upload formats the route accepts, by MIME type without parameters, and
// the file extension OpenAI is told (it reads the format from the name).
const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/mp4": "mp4",
  "video/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
}

// "audio/webm;codecs=opus" → "webm". Null for a format OpenAI cannot read.
export function audioExtension(mimeType: string): string | null {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? ""
  return AUDIO_EXTENSIONS[base] ?? null
}

const MAX_LANGUAGE_HINTS = 3
const CHINESE_REGIONS = new Set(["cn", "tw", "hk"])

// The browser's languages (navigator.languages, BCP 47: "de-DE", "en", "zh-TW")
// as the hints OpenAI's gpt-transcribe accepts: ISO 639-1 codes, plus zh-cn,
// zh-tw and zh-hk. Anything else is dropped rather than risk the whole request
// being rejected. At most three, first preference first.
export function languageHints(tags: readonly unknown[]): string[] {
  const hints: string[] = []
  for (const tag of tags) {
    if (typeof tag !== "string" || tag.length > 35) continue
    const parts = tag.trim().toLowerCase().split(/[-_]/)
    const primary = parts[0] ?? ""
    if (!/^[a-z]{2}$/.test(primary)) continue
    let hint = primary
    if (primary === "zh") {
      const region = parts.slice(1).find((part) => CHINESE_REGIONS.has(part))
      const traditional = parts.includes("hant")
      hint = region ? `zh-${region}` : traditional ? "zh-tw" : "zh"
    }
    if (!hints.includes(hint)) hints.push(hint)
    if (hints.length === MAX_LANGUAGE_HINTS) break
  }
  return hints
}

// ---------- What can go wrong, in the brand's voice (docs/brand.md) ----------

// Sent by POST /api/transcribe as { error, message }.
export type TranscribeErrorCode =
  | "session_required"
  | "bad_request"
  | "empty"
  | "too_long"
  | "too_large"
  | "unsupported_format"
  | "daily_limit"
  | "site_busy"
  | "unavailable"
  | "failed"

// Found in the browser before anything is sent.
export type RecorderErrorCode = "denied" | "no_microphone" | "microphone_busy" | "unsupported" | "too_short" | "offline" | "nothing_heard"

export type VoiceErrorCode = TranscribeErrorCode | RecorderErrorCode

export const VOICE_MESSAGES: Record<VoiceErrorCode, string> = {
  session_required: "Majnu couldn't hear that because your session ended. Reload the page, then try again.",
  bad_request: "Something went wrong sending the recording. Try again.",
  empty: "The recording was empty. Try again, a little closer to the microphone.",
  too_long: "That recording is longer than a minute. Try a shorter one.",
  too_large: "That recording is too large to send. Try a shorter one.",
  unsupported_format: "This browser records in a format Majnu can't read. Type your message instead.",
  daily_limit: "You have used voice a lot today. Typing works as always, and voice is back tomorrow.",
  site_busy: "Voice is resting for today because so many people used it. Typing works as always.",
  unavailable: "Voice isn't available right now. Type your message instead.",
  failed: "Majnu couldn't make out the recording. Try again, or type your message.",
  denied: "Majnu needs your microphone to hear you. Allow it for this site in your browser's settings, or type instead.",
  no_microphone: "No microphone was found. Type your message instead.",
  microphone_busy: "Another app is using your microphone. Close it, then try again.",
  unsupported: "This browser can't record here. Type your message instead.",
  too_short: "That was too short to hear. Tap the microphone, speak, then tap again to finish.",
  offline: "The recording didn't reach Majnu. Check your connection and try again.",
  nothing_heard: "Majnu didn't catch any words. Try again, a little closer to the microphone.",
}

// The daily-limit message names the limit that was reached.
export function dailyLimitMessage(reason: "user_count" | "user_seconds"): string {
  return reason === "user_count"
    ? `You have sent ${VOICE_LIMITS.recordingsPerDay} voice messages today, the most for one day. Typing works as always, and voice is back tomorrow.`
    : `You have spoken for ${VOICE_LIMITS.secondsPerDay / 60} minutes today, the most for one day. Typing works as always, and voice is back tomorrow.`
}

// "0:07", "1:00".
export function formatSeconds(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}
