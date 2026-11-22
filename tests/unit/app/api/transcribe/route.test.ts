import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

let user: { id: string } | null
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))

// The service-role client: the claim function, and the update or delete that
// settles or releases a claim.
const { admin, rpc, update, remove, eqUpdate, eqDelete } = vi.hoisted(() => {
  const eqUpdate = vi.fn(async () => ({ error: null }))
  const eqDelete = vi.fn(async () => ({ error: null }))
  const update = vi.fn(() => ({ eq: eqUpdate }))
  const remove = vi.fn(() => ({ eq: eqDelete }))
  const rpc = vi.fn()
  const admin = { rpc, from: vi.fn(() => ({ update, delete: remove })) }
  return { admin, rpc, update, remove, eqUpdate, eqDelete }
})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }))

import { POST } from "@/app/api/transcribe/route"
import { isCoolingOff, resetCoolingOff } from "@/lib/providers/keys"
import { MAX_AUDIO_BYTES, VOICE_LIMITS } from "@/lib/voice/rules"

const TRANSCRIPT = "Find a gift for my mum, she loves gardening"
const openai = vi.fn()

function okFromOpenAI(text = TRANSCRIPT, seconds: number | null = 4.2) {
  return Response.json(seconds === null ? { text } : { text, usage: { type: "duration", seconds } })
}

type Fields = { audio?: Blob | null; duration?: string | null; languages?: string[]; filename?: string }

function upload({ audio, duration = "4.30", languages = ["de-DE", "en-US", "en"], filename = "recording.webm" }: Fields = {}, headers: Record<string, string> = {}) {
  const form = new FormData()
  const file = audio === undefined ? new Blob([new Uint8Array(2048).fill(7)], { type: "audio/webm;codecs=opus" }) : audio
  if (file) form.append("audio", file, filename)
  if (duration !== null) form.append("duration", duration)
  for (const language of languages) form.append("language", language)
  return new Request("http://localhost:3000/api/transcribe", { method: "POST", body: form, headers })
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>
}

let errors: ReturnType<typeof vi.spyOn>
let logs: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv("OPENAI_API_KEY", "sk-test-key")
  // No fallback key unless a test sets one (vitest loads .env.local).
  vi.stubEnv("OPENAI_API_KEY_FALLBACK", "")
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000")
  vi.stubEnv("MAJNU_TRANSCRIBE_MODEL", "")
  vi.stubEnv("MAJNU_DAILY_VOICE_CAP", "")
  user = { id: "user-1" }
  resetCoolingOff()
  rpc.mockResolvedValue({ data: [{ claim_id: "claim-1", refusal: null }], error: null })
  openai.mockImplementation(async () => okFromOpenAI())
  vi.stubGlobal("fetch", openai)
  errors = vi.spyOn(console, "error").mockImplementation(() => {})
  logs = vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  errors.mockRestore()
  logs.mockRestore()
})

// Nothing the visitor said may reach the logs.
function expectNothingLogged(...secrets: string[]) {
  for (const spy of [errors, logs]) {
    for (const call of spy.mock.calls) {
      const line = call.map(String).join(" ")
      for (const secret of secrets) expect(line).not.toContain(secret)
    }
  }
}

describe("POST /api/transcribe", () => {
  it("returns the transcript", async () => {
    const res = await POST(upload())
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await json(res)).toEqual({ text: TRANSCRIPT })
    expectNothingLogged(TRANSCRIPT)
  })

  it("sends OpenAI one gpt-transcribe request with the recording and the browser's languages", async () => {
    await POST(upload())
    expect(openai).toHaveBeenCalledTimes(1)
    const [url, init] = openai.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions")
    expect(init.method).toBe("POST")
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk-test-key")
    const body = init.body as FormData
    expect(body.get("model")).toBe("gpt-transcribe")
    expect(body.get("response_format")).toBe("json")
    expect(body.getAll("languages[]")).toEqual(["de", "en"])
    expect(body.get("language")).toBeNull()
    const file = body.get("file") as File
    expect(file.name).toBe("recording.webm")
    expect(file.size).toBe(2048)
    expect([...body.keys()].sort()).toEqual(["file", "languages[]", "languages[]", "model", "response_format"])
  })

  it("names an iOS Safari recording .mp4, so OpenAI reads it as mp4", async () => {
    const audio = new Blob([new Uint8Array(1024)], { type: "audio/mp4" })
    await POST(upload({ audio, filename: "recording.mp4" }))
    const file = (openai.mock.calls[0]![1] as RequestInit).body as FormData
    expect((file.get("file") as File).name).toBe("recording.mp4")
  })

  it("sends a single `language` to a model that takes one", async () => {
    vi.stubEnv("MAJNU_TRANSCRIBE_MODEL", "whisper-1")
    await POST(upload())
    const body = (openai.mock.calls[0]![1] as RequestInit).body as FormData
    expect(body.get("model")).toBe("whisper-1")
    expect(body.get("language")).toBe("de")
    expect(body.getAll("languages[]")).toEqual([])
  })

  it("sends no language hint when the browser gave none it can use", async () => {
    await POST(upload({ languages: ["x-klingon", "123"] }))
    const body = (openai.mock.calls[0]![1] as RequestInit).body as FormData
    expect(body.getAll("languages[]")).toEqual([])
  })

  it("tries once more without hints when OpenAI rejects a language code", async () => {
    openai
      .mockResolvedValueOnce(Response.json({ error: { type: "invalid_request_error", param: "languages", code: "unsupported_language" } }, { status: 400 }))
      .mockResolvedValueOnce(okFromOpenAI())
    const res = await POST(upload())
    expect(res.status).toBe(200)
    expect(openai).toHaveBeenCalledTimes(2)
    const retry = (openai.mock.calls[1]![1] as RequestInit).body as FormData
    expect(retry.getAll("languages[]")).toEqual([])
  })

  describe("the daily limits", () => {
    it("claims the call with the per-user limits and the site cap before asking OpenAI", async () => {
      vi.stubEnv("MAJNU_DAILY_VOICE_CAP", "50")
      await POST(upload())
      expect(rpc).toHaveBeenCalledWith("claim_voice_transcription", {
        p_user_id: "user-1",
        p_seconds: 4.3,
        p_max_per_user: VOICE_LIMITS.recordingsPerDay,
        p_max_seconds_per_user: VOICE_LIMITS.secondsPerDay,
        p_max_per_site: 50,
      })
      expect(rpc.mock.invocationCallOrder[0]!).toBeLessThan(openai.mock.invocationCallOrder[0]!)
    })

    it("uses the default site cap when MAJNU_DAILY_VOICE_CAP is empty or invalid", async () => {
      vi.stubEnv("MAJNU_DAILY_VOICE_CAP", "lots")
      await POST(upload())
      expect(rpc.mock.calls[0]![1]).toMatchObject({ p_max_per_site: VOICE_LIMITS.siteRecordingsPerDayDefault })
    })

    it("records the seconds OpenAI billed", async () => {
      await POST(upload())
      expect(update).toHaveBeenCalledWith({ seconds: 4.2 })
      expect(eqUpdate).toHaveBeenCalledWith("id", "claim-1")
      expect(remove).not.toHaveBeenCalled()
    })

    it("keeps the browser's length when OpenAI reports none", async () => {
      openai.mockResolvedValueOnce(okFromOpenAI(TRANSCRIPT, null))
      await POST(upload({ duration: "7.5" }))
      expect(update).toHaveBeenCalledWith({ seconds: 7.5 })
    })

    it("refuses kindly after 20 recordings today, naming the limit", async () => {
      rpc.mockResolvedValue({ data: [{ claim_id: null, refusal: "user_count" }], error: null })
      const res = await POST(upload())
      expect(res.status).toBe(429)
      const body = await json(res)
      expect(body.error).toBe("daily_limit")
      expect(body.message).toContain("20 voice messages today")
      expect(body.message).not.toContain("!")
      expect(openai).not.toHaveBeenCalled()
    })

    it("refuses kindly after 10 minutes today", async () => {
      rpc.mockResolvedValue({ data: [{ claim_id: null, refusal: "user_seconds" }], error: null })
      const res = await POST(upload())
      expect(res.status).toBe(429)
      expect((await json(res)).message).toContain("10 minutes today")
      expect(openai).not.toHaveBeenCalled()
    })

    it("refuses when the whole site has reached today's cap", async () => {
      rpc.mockResolvedValue({ data: [{ claim_id: null, refusal: "site_cap" }], error: null })
      const res = await POST(upload())
      expect(res.status).toBe(429)
      expect((await json(res)).error).toBe("site_busy")
      expect(openai).not.toHaveBeenCalled()
    })

    it("fails closed when the limits cannot be checked", async () => {
      rpc.mockResolvedValue({ data: null, error: { message: "connection refused" } })
      const res = await POST(upload())
      expect(res.status).toBe(502)
      expect((await json(res)).error).toBe("failed")
      expect(openai).not.toHaveBeenCalled()
    })

    it("releases the claim when OpenAI fails, so a failed call does not count", async () => {
      openai.mockResolvedValueOnce(Response.json({ error: { type: "server_error" } }, { status: 500 }))
      const res = await POST(upload())
      expect(res.status).toBe(502)
      expect(await json(res)).toMatchObject({ error: "failed" })
      expect(remove).toHaveBeenCalled()
      expect(eqDelete).toHaveBeenCalledWith("id", "claim-1")
      expect(update).not.toHaveBeenCalled()
    })

    it("releases the claim when OpenAI cannot be reached", async () => {
      openai.mockRejectedValueOnce(new TypeError("fetch failed"))
      const res = await POST(upload())
      expect(res.status).toBe(502)
      expect(eqDelete).toHaveBeenCalledWith("id", "claim-1")
    })
  })

  describe("refuses before spending anything", () => {
    function expectNoSpend() {
      expect(rpc).not.toHaveBeenCalled()
      expect(openai).not.toHaveBeenCalled()
    }

    it("without a session", async () => {
      user = null
      const res = await POST(upload())
      expect(res.status).toBe(401)
      expect((await json(res)).error).toBe("session_required")
      expectNoSpend()
    })

    it("from another site", async () => {
      const res = await POST(upload({}, { origin: "https://evil.example" }))
      expect(res.status).toBe(403)
      expectNoSpend()
    })

    it("when OpenAI is not configured", async () => {
      vi.stubEnv("OPENAI_API_KEY", "")
      const res = await POST(upload())
      expect(res.status).toBe(503)
      expect((await json(res)).error).toBe("unavailable")
      expectNoSpend()
    })

    it("a recording over 4 MB", async () => {
      const audio = new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)], { type: "audio/webm" })
      const res = await POST(upload({ audio }))
      expect(res.status).toBe(413)
      expect((await json(res)).error).toBe("too_large")
      expectNoSpend()
    })

    it("a body far over the limit, without reading all of it", async () => {
      const audio = new Blob([new Uint8Array(MAX_AUDIO_BYTES * 2)], { type: "audio/webm" })
      const res = await POST(upload({ audio }))
      expect(res.status).toBe(413)
      expectNoSpend()
    })

    it("a body whose Content-Length is over the limit", async () => {
      const res = await POST(upload({}, { "content-length": String(MAX_AUDIO_BYTES * 3) }))
      expect(res.status).toBe(413)
      expectNoSpend()
    })

    it("a recording longer than a minute", async () => {
      const res = await POST(upload({ duration: "75" }))
      expect(res.status).toBe(413)
      expect((await json(res)).error).toBe("too_long")
      expectNoSpend()
    })

    it("a recording without its length", async () => {
      const res = await POST(upload({ duration: null }))
      expect(res.status).toBe(400)
      expectNoSpend()
    })

    it("an empty recording", async () => {
      const res = await POST(upload({ audio: new Blob([], { type: "audio/webm" }) }))
      expect(res.status).toBe(400)
      expect((await json(res)).error).toBe("empty")
      expectNoSpend()
    })

    it("a format OpenAI cannot read", async () => {
      const audio = new Blob([new Uint8Array(512)], { type: "audio/ogg;codecs=opus" })
      const res = await POST(upload({ audio, filename: "recording.ogg" }))
      expect(res.status).toBe(415)
      expect((await json(res)).error).toBe("unsupported_format")
      expectNoSpend()
    })

    it("a request without a recording", async () => {
      const res = await POST(upload({ audio: null }))
      expect(res.status).toBe(400)
      expectNoSpend()
    })

    it("a body that is not a form", async () => {
      const res = await POST(
        new Request("http://localhost:3000/api/transcribe", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }),
      )
      expect(res.status).toBe(400)
      expectNoSpend()
    })
  })

  // Issue #67: OPENAI_API_KEY_FALLBACK when the primary cannot be used.
  describe("with a fallback key", () => {
    const keyOf = (init?: RequestInit) => new Headers(init?.headers).get("authorization")
    const quota = () =>
      Response.json({ error: { message: "You exceeded your current quota", type: "insufficient_quota", code: "insufficient_quota" } }, { status: 429 })
    const invalidKey = () => Response.json({ error: { message: "Incorrect API key", type: "invalid_request_error", code: "invalid_api_key" } }, { status: 401 })

    // The service-role client answers the voice claim and the spend ledger.
    function ledger(reserveTotal: string | null = "0.0100") {
      rpc.mockImplementation(async (name: string) => {
        if (name === "reserve_provider_spend") return { data: reserveTotal, error: null }
        if (name === "settle_provider_spend") return { data: "0.0003", error: null }
        return { data: [{ claim_id: "claim-1", refusal: null }], error: null }
      })
    }

    let warnings: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
      vi.stubEnv("OPENAI_API_KEY_FALLBACK", "sk-fallback-key")
      vi.stubEnv("FALLBACK_CAP_USD", "")
      warnings = vi.spyOn(console, "warn").mockImplementation(() => {})
    })
    afterEach(() => warnings.mockRestore())

    it("uses the primary key while it works, and counts nothing against the cap", async () => {
      ledger()
      const res = await POST(upload())
      expect(res.status).toBe(200)
      expect(openai.mock.calls.map(([, init]) => keyOf(init))).toEqual(["Bearer sk-test-key"])
      expect(rpc.mock.calls.map(([name]) => name)).toEqual(["claim_voice_transcription"])
    })

    it("moves to the fallback key when the primary is out of quota, and counts its cost", async () => {
      ledger()
      openai.mockImplementationOnce(async () => quota()).mockImplementationOnce(async () => okFromOpenAI(TRANSCRIPT, 4.2))
      const res = await POST(upload())
      expect(res.status).toBe(200)
      expect((await json(res)).text).toBe(TRANSCRIPT)
      expect(openai.mock.calls.map(([, init]) => keyOf(init))).toEqual(["Bearer sk-test-key", "Bearer sk-fallback-key"])
      const names = rpc.mock.calls.map(([name]) => name)
      expect(names).toEqual(["claim_voice_transcription", "reserve_provider_spend", "settle_provider_spend"])
      const reserved = rpc.mock.calls[1][1] as { p_provider: string; p_usd: number; p_cap_usd: number }
      expect(reserved).toMatchObject({ p_provider: "openai", p_cap_usd: 150 })
      // 4.2 billed seconds of gpt-transcribe at $0.0045 a minute, minus what was reserved.
      const settled = rpc.mock.calls[2][1] as { p_delta_usd: number }
      expect(reserved.p_usd + settled.p_delta_usd).toBeCloseTo(0.000315, 6)
      expect(isCoolingOff("OPENAI_API_KEY")).toBe(true)
      expect(warnings.mock.calls.flat().join(" ")).toMatch(/openai: OPENAI_API_KEY refused \(quota\)/)
      expectNothingLogged(TRANSCRIPT, "sk-test-key", "sk-fallback-key")
    })

    it("does not switch on an ordinary rate limit", async () => {
      ledger()
      openai.mockImplementationOnce(async () => Response.json({ error: { code: "rate_limit_exceeded", type: "requests" } }, { status: 429 }))
      const res = await POST(upload())
      expect(res.status).toBe(502)
      expect(openai).toHaveBeenCalledTimes(1)
    })

    it("answers 429 site_busy when the fallback key is refused too, and releases the claim", async () => {
      ledger()
      openai.mockImplementationOnce(async () => invalidKey()).mockImplementationOnce(async () => invalidKey())
      const res = await POST(upload())
      expect(res.status).toBe(429)
      expect(await json(res)).toMatchObject({ error: "site_busy" })
      expect(remove).toHaveBeenCalled()
      expect(eqDelete).toHaveBeenCalledWith("id", "claim-1")
    })

    it("answers 429 site_busy without calling the fallback once its monthly cap is reached", async () => {
      ledger(null)
      openai.mockImplementationOnce(async () => quota())
      const res = await POST(upload())
      expect(res.status).toBe(429)
      expect(await json(res)).toMatchObject({ error: "site_busy" })
      expect(openai).toHaveBeenCalledTimes(1)
    })
  })
})
