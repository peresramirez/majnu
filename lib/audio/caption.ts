// The caption of a voice note: what was said, for screen readers. Made with
// the voice-input transcription (lib/voice), within its limits: each caption
// is claimed against the same per-user and site-wide daily counts as a
// recording sent from the message box. Anything that goes wrong means no
// caption, never a failed upload. Neither the audio nor the text is logged.
import "server-only"
import { TranscriptionError, transcribeAudio, transcribeModel } from "@/lib/voice/openai"
import { audioExtension, languageHints } from "@/lib/voice/rules"
import { claimTranscription, releaseTranscription, settleTranscription } from "@/lib/voice/usage"
import { cleanCaption } from "./rules"

export type CaptionInput = { userId: string; audio: Blob; mimeType: string; seconds: number; languages: unknown[] }

export async function transcribeCaption({ userId, audio, mimeType, seconds, languages }: CaptionInput): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  // OpenAI reads webm, mp4 and mp3, not ogg.
  const extension = audioExtension(mimeType)
  if (!extension) return null

  let claimId: string
  try {
    const claim = await claimTranscription(userId, seconds)
    if (!claim.ok) return null
    claimId = claim.id
  } catch (error) {
    console.error("[audio] could not check the voice limits", error instanceof Error ? error.message : "unknown error")
    return null
  }

  try {
    const result = await transcribeAudio({
      audio,
      filename: `note.${extension}`,
      languages: languageHints(languages),
      apiKey,
      model: transcribeModel(),
    })
    try {
      await settleTranscription(claimId, result.seconds ?? seconds)
    } catch (error) {
      console.error("[audio] could not record the caption's length", error instanceof Error ? error.message : "")
    }
    return cleanCaption(result.text)
  } catch (error) {
    const detail = error instanceof TranscriptionError ? `${error.status} ${error.code}` : "unexpected error"
    console.error("[audio] caption failed:", detail)
    try {
      await releaseTranscription(claimId)
    } catch {
      // The claim stays counted; nothing else to do.
    }
    return null
  }
}
