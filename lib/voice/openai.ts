// Speech to text with OpenAI's transcription endpoint, called with plain
// fetch: AGENTS.md allows OpenAI for this one job and no OpenAI SDK.
//
// The model is gpt-transcribe, which OpenAI's guide recommends for recorded
// speech in its original language (gpt-4o-mini-transcribe is deprecated). It
// is billed per minute of audio and reports the billed seconds in `usage`,
// which the daily limits count. It takes several language hints in
// `languages[]`, where older models take one `language`.
//
// Neither the audio nor the transcript is logged or stored here.
import "server-only"

export const TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions"
export const DEFAULT_TRANSCRIBE_MODEL = "gpt-transcribe"
const TIMEOUT_MS = 30_000

export type TranscribeInput = {
  audio: Blob
  // With the right extension: OpenAI reads the format from the file name.
  filename: string
  languages: string[]
  apiKey: string
  model?: string
}

export type TranscribeResult = {
  text: string
  // What OpenAI billed, when it says; null for models billed by tokens.
  seconds: number | null
}

export class TranscriptionError extends Error {
  constructor(
    readonly status: number,
    // OpenAI's error code or type, never its message (it could quote input).
    readonly code: string,
  ) {
    super(`OpenAI transcription failed with ${status}${code ? ` (${code})` : ""}`)
    this.name = "TranscriptionError"
  }
}

export function transcribeModel(): string {
  return process.env.MAJNU_TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIBE_MODEL
}

// The multipart body for one request.
export function transcriptionForm(input: TranscribeInput, withLanguages = true): FormData {
  const model = input.model ?? DEFAULT_TRANSCRIBE_MODEL
  const form = new FormData()
  form.append("file", input.audio, input.filename)
  form.append("model", model)
  form.append("response_format", "json")
  if (withLanguages && input.languages.length > 0) {
    if (model === "gpt-transcribe") {
      for (const code of input.languages) form.append("languages[]", code)
    } else if (/^[a-z]{2}$/.test(input.languages[0] ?? "")) {
      form.append("language", input.languages[0]!)
    }
  }
  return form
}

async function errorCode(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { code?: unknown; type?: unknown; param?: unknown } }
    const { code, type, param } = body.error ?? {}
    return [code, type, param].filter((part): part is string => typeof part === "string" && part.length < 80).join("/")
  } catch {
    return ""
  }
}

async function post(form: FormData, apiKey: string, fetcher: typeof fetch): Promise<Response> {
  return fetcher(TRANSCRIPTIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

// One transcription. If OpenAI rejects the request over a language hint (it
// rejects the whole request for a code it does not support), it is sent once
// more without hints; a rejected request is not billed.
export async function transcribeAudio(input: TranscribeInput, fetcher: typeof fetch = fetch): Promise<TranscribeResult> {
  let res: Response
  try {
    res = await post(transcriptionForm(input), input.apiKey, fetcher)
  } catch (error) {
    throw new TranscriptionError(0, error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network")
  }

  if (res.status === 400 && input.languages.length > 0) {
    const code = await errorCode(res)
    if (!code.includes("language")) throw new TranscriptionError(400, code)
    try {
      res = await post(transcriptionForm(input, false), input.apiKey, fetcher)
    } catch (error) {
      throw new TranscriptionError(0, error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network")
    }
  }

  if (!res.ok) throw new TranscriptionError(res.status, await errorCode(res))

  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new TranscriptionError(res.status, "invalid_json")
  }
  const { text, usage } = (body ?? {}) as { text?: unknown; usage?: { type?: unknown; seconds?: unknown } }
  if (typeof text !== "string") throw new TranscriptionError(res.status, "no_text")
  const seconds = usage?.type === "duration" && typeof usage.seconds === "number" && Number.isFinite(usage.seconds) ? usage.seconds : null
  return { text: text.trim(), seconds }
}
