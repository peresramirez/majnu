import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { MAX_DESIGN_BYTES, OUTPUT_FILE, PROJECT_DIR, RUN_TIME_LIMIT_SECONDS } from "@/lib/daytona/config"
import {
  buildClaudeCommand,
  buildPrompt,
  cleanRequest,
  parseClaudeOutput,
  redact,
  redesignLetter,
  RedesignError,
  type RedesignDeps,
  type SandboxHandle,
  type Sandboxes,
} from "@/lib/daytona/redesign"
import type { LetterContent } from "@/lib/letters/schema"

const LETTER_ID = "6e004a41-de61-4a68-addf-7aef8469fc9e"
const ANTHROPIC_KEY = "sk-ant-api03-unit-test-anthropic-key"
const SANDBOX_KEY = "sk-ant-api03-unit-test-sandbox-key"
const DAYTONA_KEY = "dtn_unit_test_daytona_key"
const REQUEST = "Make it feel like a 1950s cinema ticket by the sea"

const content: LetterContent = {
  recipientName: "Lucia",
  senderName: "Javier",
  occasion: "Birthday",
  headline: "Happy birthday, Lucia",
  body: ["Another year of you."],
  signOff: "With love",
  theme: { palette: "rose", font: "script" },
  gifts: [{ title: "Spa day", url: "https://spa.example/voucher", code: "SPA-2026" }],
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>A letter for Lucia</title>
<style>body { font-family: Georgia, serif; }</style></head>
<body><main><h1>Happy birthday, Lucia</h1><p>Another year of you.</p>
<a href="https://spa.example/voucher" target="_blank" rel="noopener noreferrer">Your spa day</a>
<button id="r">Reveal your code</button><p id="c" aria-live="polite"></p></main>
<script>document.getElementById("r").onclick = () => { document.getElementById("c").textContent = "SPA-2026" }</script>
</body></html>`

const CLAUDE_OK = JSON.stringify({ type: "result", subtype: "success", is_error: false, num_turns: 9, total_cost_usd: 0.4321, duration_ms: 95000, result: "A seaside cinema ticket." })

// ---------- Fakes ----------

type Row = { id: string; kind: string; template_id: string | null; content: unknown } | null

function fakeDb(letter: Row, opts: { insertError?: string } = {}) {
  const inserts: unknown[] = []
  const db = {
    from(table: string) {
      if (table === "letters") {
        return {
          select: () => ({
            eq: (_column: string, value: string) => ({
              maybeSingle: async () => ({ data: letter && letter.id === value ? letter : null, error: null }),
            }),
          }),
        }
      }
      if (table === "letter_designs") {
        return {
          insert: (row: unknown) => {
            inserts.push(row)
            return {
              select: () => ({
                single: async () =>
                  opts.insertError
                    ? { data: null, error: { message: opts.insertError } }
                    : { data: { id: "design-1", created_at: "2026-11-21T20:00:00Z" }, error: null },
              }),
            }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return { db: db as unknown as RedesignDeps["db"], inserts }
}

type SandboxScript = {
  exitCode?: number
  stdout?: string
  html?: string | null
  fileSize?: number
  uploadError?: Error
  deleteFailures?: number
  stderr?: string
}

function fakeSandbox(script: SandboxScript = {}) {
  const calls = {
    uploads: [] as { source: Buffer; destination: string }[],
    commands: [] as { command: string; cwd?: string; env?: Record<string, string>; timeout?: number }[],
    deletes: [] as unknown[][],
    downloads: [] as string[],
  }
  let deleteFailures = script.deleteFailures ?? 0
  const html = script.html === undefined ? PAGE : script.html
  const sandbox: SandboxHandle = {
    id: "sbx-test-1",
    fs: {
      async uploadFiles(files) {
        if (script.uploadError) throw script.uploadError
        calls.uploads.push(...files)
      },
      async getFileDetails(path) {
        if (path !== OUTPUT_FILE || html === null) throw new Error("file not found")
        return { size: script.fileSize ?? Buffer.byteLength(html) }
      },
      async downloadFile(path) {
        calls.downloads.push(path)
        if (path === "/tmp/claude.stderr") return Buffer.from(script.stderr ?? "")
        if (path !== OUTPUT_FILE || html === null) throw new Error("file not found")
        return Buffer.from(html)
      },
    },
    process: {
      async executeCommand(command, cwd, env, timeout) {
        calls.commands.push({ command, cwd, env, timeout })
        return { exitCode: script.exitCode ?? 0, result: script.stdout ?? CLAUDE_OK }
      },
    },
    async delete(...args) {
      calls.deletes.push(args)
      if (deleteFailures > 0) {
        deleteFailures--
        throw new Error("Daytona is unavailable")
      }
    },
  }
  return { sandbox, calls }
}

function fakeSandboxes(sandbox: SandboxHandle | Error) {
  const created: Parameters<Sandboxes["create"]>[] = []
  const cleanups: Record<string, string>[] = []
  const sandboxes: Sandboxes = {
    async create(...args) {
      created.push(args)
      if (sandbox instanceof Error) throw sandbox
      return sandbox
    },
    async deleteByLabels(labels) {
      cleanups.push(labels)
      return 1
    },
  }
  return { sandboxes, created, cleanups }
}

const letterRow = (overrides: Partial<NonNullable<Row>> = {}): Row => ({
  id: LETTER_ID,
  kind: "letter",
  template_id: "classic-envelope",
  content,
  ...overrides,
})

function setup(script: SandboxScript = {}, row: Row = letterRow()) {
  const { db, inserts } = fakeDb(row)
  const { sandbox, calls } = fakeSandbox(script)
  const { sandboxes, created, cleanups } = fakeSandboxes(sandbox)
  const logs: string[] = []
  const deps = { db, sandboxes, log: (line: string) => logs.push(line) }
  return { deps, inserts, calls, created, cleanups, logs }
}

beforeEach(() => {
  // Never the real keys from .env.local, which vitest loads.
  vi.stubEnv("DAYTONA_API_KEY", DAYTONA_KEY)
  vi.stubEnv("ANTHROPIC_API_KEY", ANTHROPIC_KEY)
  vi.stubEnv("DAYTONA_ANTHROPIC_API_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-unit-test-key")
  vi.stubEnv("STRIPE_SECRET_KEY", "")
  vi.stubEnv("MAJNU_MODEL", "")
  vi.stubEnv("DAYTONA_SNAPSHOT", "")
  vi.stubEnv("DAYTONA_TARGET", "")
  vi.stubEnv("DAYTONA_API_URL", "")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ---------- The job ----------

describe("redesignLetter", () => {
  it("makes the page in a locked-down sandbox, deletes the sandbox and stores the page", async () => {
    const { deps, inserts, calls, created } = setup()
    const result = await redesignLetter(LETTER_ID, `  ${REQUEST}  `, deps)

    expect(result).toMatchObject({ designId: "design-1", sandboxId: "sbx-test-1", sandboxDeleted: true, bytes: Buffer.byteLength(PAGE) })
    expect(result.run).toMatchObject({ subtype: "success", turns: 9, costUsd: 0.4321 })

    // An ephemeral sandbox from our snapshot, with a TTL backstop and only the Anthropic API reachable.
    expect(created).toHaveLength(1)
    const [params, options] = created[0]
    expect(params).toMatchObject({
      snapshot: "majnu-letters-v1",
      ephemeral: true,
      ttlMinutes: 20,
      domainAllowList: "api.anthropic.com",
      labels: { app: "majnu", purpose: "redesign" },
    })
    expect(params.labels?.job).toMatch(/^[0-9a-f-]{36}$/)
    // No environment for the sandbox itself: the key goes into the one command's env only.
    expect(Object.keys(params)).not.toContain("envVars")
    expect(Object.keys(params)).not.toContain("env")
    expect(JSON.stringify(params)).not.toContain(ANTHROPIC_KEY)
    expect(options.timeout).toBeGreaterThan(0)

    // The inputs are files; the request is one of them, as cleaned.
    const files = Object.fromEntries(calls.uploads.map((f) => [f.destination, f.source.toString("utf8")]))
    expect(Object.keys(files).sort()).toEqual([
      `${PROJECT_DIR}/input/content.json`,
      `${PROJECT_DIR}/input/prompt.md`,
      `${PROJECT_DIR}/input/request.txt`,
    ])
    expect(JSON.parse(files[`${PROJECT_DIR}/input/content.json`])).toEqual(content)
    expect(files[`${PROJECT_DIR}/input/request.txt`]).toBe(`${REQUEST}\n`)
    for (const text of Object.values(files)) expect(text).not.toContain(ANTHROPIC_KEY)

    // The key is in the command's environment only, never in the command text.
    expect(calls.commands).toHaveLength(1)
    const [command] = calls.commands
    expect(command.env).toEqual({ ANTHROPIC_API_KEY: ANTHROPIC_KEY, MAJNU_MODEL: "claude-opus-5-5" })
    expect(command.command).toBe(buildClaudeCommand())
    expect(command.command).not.toContain(ANTHROPIC_KEY)
    expect(command.command).not.toContain(REQUEST)
    expect(command.cwd).toBe(PROJECT_DIR)
    expect(command.timeout).toBeGreaterThan(RUN_TIME_LIMIT_SECONDS)

    // Deleted and waited for, then stored.
    expect(calls.deletes).toEqual([[60, true]])
    expect(inserts).toEqual([{ letter_id: LETTER_ID, html: PAGE, request: REQUEST }])
  })

  it("uses the sandbox's own key when DAYTONA_ANTHROPIC_API_KEY is set", async () => {
    vi.stubEnv("DAYTONA_ANTHROPIC_API_KEY", SANDBOX_KEY)
    const { deps, calls } = setup()
    await redesignLetter(LETTER_ID, REQUEST, deps)
    expect(calls.commands[0].env?.ANTHROPIC_API_KEY).toBe(SANDBOX_KEY)
  })

  it("passes MAJNU_MODEL to Claude Code", async () => {
    vi.stubEnv("MAJNU_MODEL", "claude-sonnet-5-5")
    const { deps, calls } = setup()
    await redesignLetter(LETTER_ID, REQUEST, deps)
    expect(calls.commands[0].env?.MAJNU_MODEL).toBe("claude-sonnet-5-5")
  })

  it("never writes a key to the log", async () => {
    const { deps, logs } = setup({ stdout: JSON.stringify({ subtype: "success", num_turns: 2, result: `My key is ${ANTHROPIC_KEY}` }) })
    await expect(redesignLetter(LETTER_ID, REQUEST, deps)).resolves.toBeTruthy()
    expect(logs.join("\n")).not.toContain(ANTHROPIC_KEY)
    expect(logs.join("\n")).toContain("[redacted]")
  })

  it("deletes the sandbox and stores nothing when Claude Code fails", async () => {
    const { deps, inserts, calls } = setup({ exitCode: 1, html: null, stdout: "", stderr: `Error: invalid x-api-key ${ANTHROPIC_KEY}` })
    const error = await redesignLetter(LETTER_ID, REQUEST, deps).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RedesignError)
    expect((error as Error).message).toMatch(/Claude Code failed \(exit 1\)/)
    expect((error as Error).message).not.toContain(ANTHROPIC_KEY)
    expect(calls.deletes).toHaveLength(1)
    expect(inserts).toEqual([])
  })

  it("reports the time limit", async () => {
    const { deps, calls } = setup({ exitCode: 124, html: null, stdout: "" })
    await expect(redesignLetter(LETTER_ID, REQUEST, deps)).rejects.toThrow(/ran out of time/)
    expect(calls.deletes).toHaveLength(1)
  })

  it("checks a page written before Claude Code reached its budget", async () => {
    const { deps, inserts } = setup({ exitCode: 1, stdout: JSON.stringify({ subtype: "error_max_budget_usd", is_error: true, num_turns: 31 }) })
    await expect(redesignLetter(LETTER_ID, REQUEST, deps)).resolves.toMatchObject({ designId: "design-1" })
    expect(inserts).toHaveLength(1)
  })

  it("fails when no page was written", async () => {
    const { deps, calls, inserts } = setup({ html: null })
    await expect(redesignLetter(LETTER_ID, REQUEST, deps)).rejects.toThrow(/without writing out\/index.html/)
    expect(calls.deletes).toHaveLength(1)
    expect(inserts).toEqual([])
  })

  it("refuses a page over the size limit without downloading it", async () => {
    const { deps, calls, inserts } = setup({ fileSize: MAX_DESIGN_BYTES + 1 })
    await expect(redesignLetter(LETTER_ID, REQUEST, deps)).rejects.toThrow(/over the limit/)
    expect(calls.downloads).not.toContain(OUTPUT_FILE)
    expect(calls.deletes).toHaveLength(1)
    expect(inserts).toEqual([])
  })

  it("deletes the sandbox when an upload fails", async () => {
    const { deps, calls } = setup({ uploadError: new Error("connection reset") })
    await expect(redesignLetter(LETTER_ID, REQUEST, deps)).rejects.toThrow(/connection reset/)
    expect(calls.commands).toEqual([])
    expect(calls.deletes).toHaveLength(1)
  })

  it("throws away a page that breaks the rules, after deleting the sandbox", async () => {
    const bad = PAGE.replace("</head>", '<script src="https://cdn.example/confetti.js"></script></head>')
    const { deps, calls, inserts } = setup({ html: bad })
    await expect(redesignLetter(LETTER_ID, REQUEST, deps)).rejects.toThrow(/failed the checks.*script with src/)
    expect(calls.deletes).toHaveLength(1)
    expect(inserts).toEqual([])
  })

  it("throws away a page that shows the gift code before a tap", async () => {
    const { deps, inserts } = setup({ html: PAGE.replace("<h1>", "<h1>SPA-2026 ") })
    await expect(redesignLetter(LETTER_ID, REQUEST, deps)).rejects.toThrow(/gift code/)
    expect(inserts).toEqual([])
  })

  it("throws away a page that leaks the key", async () => {
    const { deps, inserts } = setup({ html: PAGE.replace("<h1>", `<h1>${ANTHROPIC_KEY} `) })
    const error = await redesignLetter(LETTER_ID, REQUEST, deps).then(
      () => new Error("expected the job to fail"),
      (e: unknown) => e as Error,
    )
    expect(error.message).toMatch(/secret key/)
    expect(error.message).not.toContain(ANTHROPIC_KEY)
    expect(inserts).toEqual([])
  })

  it("stores the page even if the sandbox cannot be deleted, and says so", async () => {
    const { deps, calls, inserts, logs } = setup({ deleteFailures: 2 })
    const result = await redesignLetter(LETTER_ID, REQUEST, deps)
    expect(result.sandboxDeleted).toBe(false)
    expect(calls.deletes).toHaveLength(2)
    expect(inserts).toHaveLength(1)
    expect(logs.join("\n")).toMatch(/TTL will remove it/)
  })

  it("retries a failed delete once", async () => {
    const { deps, calls } = setup({ deleteFailures: 1 })
    const result = await redesignLetter(LETTER_ID, REQUEST, deps)
    expect(result.sandboxDeleted).toBe(true)
    expect(calls.deletes).toHaveLength(2)
  })

  it("falls back to the tier's network policy when the account refuses an allow list", async () => {
    const { db } = fakeDb(letterRow())
    const { sandbox, calls } = fakeSandbox()
    const created: Parameters<Sandboxes["create"]>[] = []
    const sandboxes: Sandboxes = {
      async create(...args) {
        created.push(args)
        if (args[0].domainAllowList) {
          throw new Error("Network access is restricted and cannot be overridden at the sandbox level. Remove domainAllowList from the request.")
        }
        return sandbox
      },
      deleteByLabels: async () => 0,
    }
    const logs: string[] = []
    await expect(redesignLetter(LETTER_ID, REQUEST, { db, sandboxes, log: (l) => logs.push(l) })).resolves.toMatchObject({ designId: "design-1" })
    expect(created).toHaveLength(2)
    expect(created[1][0].domainAllowList).toBeUndefined()
    expect(created[1][0]).toMatchObject({ snapshot: "majnu-letters-v1", ephemeral: true, ttlMinutes: 20 })
    expect(logs.join("\n")).toMatch(/tier's own network policy/)
    expect(calls.deletes).toHaveLength(1)
  })

  it("does not retry other start failures without the allow list", async () => {
    const { db } = fakeDb(letterRow())
    const { sandboxes, created } = fakeSandboxes(new Error("No available runners"))
    await expect(redesignLetter(LETTER_ID, REQUEST, { db, sandboxes, log: () => {} })).rejects.toThrow(/No available runners/)
    expect(created).toHaveLength(1)
  })

  it("cleans up by label when the sandbox fails to start", async () => {
    const { db } = fakeDb(letterRow())
    const { sandboxes, cleanups, created } = fakeSandboxes(new Error("timed out waiting for the sandbox to start"))
    await expect(redesignLetter(LETTER_ID, REQUEST, { db, sandboxes, log: () => {} })).rejects.toThrow(/Could not start a sandbox/)
    expect(cleanups).toEqual([{ job: created[0][0].labels?.job }])
  })

  it.each([
    ["a calendar", letterRow({ kind: "calendar", template_id: "advent-classic" }), /Only letters/],
    ["a letter without content", letterRow({ content: null }), /no valid content/],
    ["an unknown letter", null, /Letter not found/],
  ])("refuses %s before starting a sandbox", async (_name, row, message) => {
    const { deps, created } = setup({}, row)
    await expect(redesignLetter(LETTER_ID, REQUEST, deps)).rejects.toThrow(message)
    expect(created).toEqual([])
  })

  it("refuses bad input before touching anything", async () => {
    const { deps, created } = setup()
    await expect(redesignLetter("not-a-uuid", REQUEST, deps)).rejects.toThrow(/not a UUID/)
    await expect(redesignLetter(LETTER_ID, "   ", deps)).rejects.toThrow(/empty/)
    expect(created).toEqual([])
  })

  it("needs a Daytona key and an Anthropic key", async () => {
    const { deps } = setup()
    vi.stubEnv("DAYTONA_API_KEY", "")
    await expect(redesignLetter(LETTER_ID, REQUEST, deps)).rejects.toThrow(/DAYTONA_API_KEY/)
    vi.stubEnv("DAYTONA_API_KEY", DAYTONA_KEY)
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    await expect(redesignLetter(LETTER_ID, REQUEST, deps)).rejects.toThrow(/ANTHROPIC_API_KEY/)
  })

  it("uses DAYTONA_SNAPSHOT when it is set", async () => {
    vi.stubEnv("DAYTONA_SNAPSHOT", "majnu-letters-v2")
    const { deps, created } = setup()
    await redesignLetter(LETTER_ID, REQUEST, deps)
    expect(created[0][0].snapshot).toBe("majnu-letters-v2")
  })
})

// ---------- Pieces ----------

describe("buildClaudeCommand", () => {
  it("runs Claude Code headless with limits, the model from the environment and the prompt from a file", () => {
    const command = buildClaudeCommand()
    expect(command).toMatch(/^bash -c '[^']+'$/)
    expect(command).toContain(`timeout --kill-after=15 ${RUN_TIME_LIMIT_SECONDS}`)
    expect(command).toContain('claude --print "$(cat input/prompt.md)"')
    expect(command).toContain('--model "$MAJNU_MODEL"')
    expect(command).toContain("--max-budget-usd 3")
    expect(command).toContain("--effort medium")
    // Only file tools, confined to the project folder, with our settings.
    expect(command).toContain('--tools "Read,Write,Edit,Glob,Grep"')
    expect(command).toContain("--restricted")
    expect(command).toContain("--settings .claude/settings.json")
    expect(command).toMatch(/--disallowedTools "[^"]*Bash[^"]*WebFetch[^"]*"/)
    expect(command).toContain("--no-session-persistence")
    expect(command).not.toContain("--max-turns")
    expect(command).not.toContain("ANTHROPIC_API_KEY")
    expect(command).not.toContain("dangerously")
  })
})

describe("buildPrompt", () => {
  it("names the skill, the inputs and the output, and the current template", () => {
    const prompt = buildPrompt("classic-envelope")
    expect(prompt).toContain(".claude/skills/majnu-letter/SKILL.md")
    expect(prompt).toContain("input/content.json")
    expect(prompt).toContain("input/request.txt")
    expect(prompt).toContain("out/index.html")
    expect(prompt).toContain('"Classic envelope" template')
  })
})

describe("cleanRequest", () => {
  it("trims, normalises line ends and drops control characters", () => {
    expect(cleanRequest("  Sea\r\nand\u0007 sun\n\n\n\nplease  ")).toBe("Sea\nand sun\n\nplease")
  })

  it("rejects empty and overlong requests", () => {
    expect(() => cleanRequest(" \n ")).toThrow(/empty/)
    expect(() => cleanRequest("x".repeat(2001))).toThrow(/over 2000/)
    expect(cleanRequest("x".repeat(2000))).toHaveLength(2000)
  })
})

describe("parseClaudeOutput", () => {
  it("reads the final JSON report", () => {
    expect(parseClaudeOutput(`warming up\n${CLAUDE_OK}\n`)).toEqual({
      subtype: "success",
      isError: false,
      turns: 9,
      costUsd: 0.4321,
      durationMs: 95000,
      reply: "A seaside cinema ticket.",
    })
  })

  it("returns null for anything else", () => {
    expect(parseClaudeOutput("")).toBeNull()
    expect(parseClaudeOutput("{not json")).toBeNull()
  })
})

describe("redact", () => {
  it("removes the given secrets and anything shaped like an Anthropic key", () => {
    expect(redact(`a ${DAYTONA_KEY} b sk-ant-other-key-123 c`, [DAYTONA_KEY])).toBe("a [redacted] b [redacted] c")
  })
})
