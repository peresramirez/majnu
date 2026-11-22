// `npm run coupon` (scripts/coupon.ts), run for real with Node against a
// local stand-in for Supabase's REST API, so nothing reaches the database:
// what it sends for random and chosen codes, that only the hash is stored,
// and that list and disable never handle a code from the database.
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

type Seen = { method: string; url: string; body: Record<string, unknown> | null }
const seen: Seen[] = []
let insertStatus = 201
let server: Server
let url = ""

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ""
    req.on("data", (chunk) => (raw += chunk))
    req.on("end", () => {
      seen.push({ method: req.method ?? "", url: decodeURIComponent(req.url ?? ""), body: raw ? JSON.parse(raw) : null })
      res.setHeader("content-type", "application/json")
      if (req.method === "POST") {
        if (insertStatus === 409) return res.writeHead(409).end(JSON.stringify({ code: "23505", message: "duplicate key value" }))
        return res.writeHead(201).end("")
      }
      if (req.method === "PATCH") return res.writeHead(200).end(JSON.stringify([{ label: "poster", uses: 3, max_uses: 100 }]))
      res.writeHead(200).end(JSON.stringify([{ label: "poster", uses: 3, max_uses: 100, expires_at: null, active: true, created_at: "2026-11-22T08:00:00+00:00" }]))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

beforeEach(() => {
  seen.length = 0
  insertStatus = 201
})

const SCRIPT = fileURLToPath(new URL("../../../scripts/coupon.ts", import.meta.url))

function run(args: string[], extraEnv: Record<string, string> = {}): Promise<{ code: number; out: string; err: string }> {
  // The stand-in's address and a dummy key; .env.local never overrides them.
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith("npm_config_")) env[k] = v
  Object.assign(env, { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: "stub-service-key" }, extraEnv)
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", SCRIPT, ...args],
      { env: env as NodeJS.ProcessEnv, timeout: 15_000, encoding: "utf8" },
      (error: Error | null, stdout: string, stderr: string) => {
        resolve({ code: error ? Number((error as { code?: number }).code ?? 1) : 0, out: stdout, err: stderr })
      },
    )
  })
}

const sha = (code: string) => createHash("sha256").update(code).digest("hex")

describe("npm run coupon", () => {
  it("creates a random code, prints it once and sends only its hash", async () => {
    const { code, out } = await run(["create", "--uses", "3", "--days", "7", "--label", "Launch", "test"])
    expect(code).toBe(0)
    const printed = out.match(/^ {2}([34679ACDEFGHJKMNPQRTWXY]{4}(?:-[34679ACDEFGHJKMNPQRTWXY]{4}){3})$/m)?.[1]
    expect(printed).toBeDefined()
    expect(seen).toHaveLength(1)
    const body = seen[0].body!
    expect(seen[0]).toMatchObject({ method: "POST", url: "/rest/v1/coupons" })
    expect(body.code_hash).toBe(sha(printed!.replace(/-/g, "")))
    expect(body).toMatchObject({ label: "Launch test", max_uses: 3 })
    expect(Date.parse(String(body.expires_at)) - Date.now()).toBeGreaterThan(6.9 * 24 * 3600 * 1000)
    expect(JSON.stringify(body)).not.toContain(printed!.replace(/-/g, ""))
  })

  it("creates a chosen code for a poster: --code LAYLA100 --uses 100", async () => {
    const { code, out } = await run(["create", "--code", "layla-100", "--uses", "100", "--label", "poster"])
    expect(code).toBe(0)
    expect(out).toContain("LAYLA100")
    expect(seen[0].body).toEqual({ code_hash: sha("LAYLA100"), label: "poster", max_uses: 100, expires_at: null })
  })

  it("takes --code=LAYLA100 from npm, which passes it on as npm_config_code", async () => {
    const { code } = await run(["create"], { npm_config_code: "LAYLA100", npm_config_uses: "100", npm_config_label: "poster" })
    expect(code).toBe(0)
    expect(seen[0].body).toMatchObject({ code_hash: sha("LAYLA100"), max_uses: 100, label: "poster" })
  })

  it("explains what to do when npm kept --code for itself, and creates nothing", async () => {
    const { code, err } = await run(["create", "LAYLA100", "100"], { npm_config_code: "true", npm_config_uses: "true" })
    expect(code).toBe(2)
    expect(err).toMatch(/npm run coupon -- create/)
    expect(seen).toHaveLength(0)
  })

  it.each([["ABC12"], ["LAYLA!00"], ["A".repeat(25)]])("refuses the chosen code %s", async (chosen) => {
    const { code, err } = await run(["create", "--code", chosen])
    expect(code).toBe(2)
    expect(err).toMatch(/6 to 24 letters and digits/)
    expect(seen).toHaveLength(0)
  })

  it("refuses a chosen code that exists already instead of making another", async () => {
    insertStatus = 409
    const { code, err } = await run(["create", "--code", "LAYLA100"])
    expect(code).toBe(1)
    expect(err).toMatch(/exists already/)
    expect(seen).toHaveLength(1)
  })

  it("refuses bad numbers", async () => {
    for (const args of [["--uses", "0"], ["--uses", "1.5"], ["--days", "-3"]]) {
      expect((await run(["create", ...args])).code).toBe(2)
    }
    expect(seen).toHaveLength(0)
  })

  it("lists labels, uses, expiry and state without asking for any code", async () => {
    const { code, out } = await run(["list"])
    expect(code).toBe(0)
    expect(seen[0].url).toBe("/rest/v1/coupons?select=label,uses,max_uses,expires_at,active,created_at&order=created_at.desc&limit=200")
    expect(out).toMatch(/poster\s+3\/100\s+never\s+active/)
  })

  it("disables a code by the hash of what was typed", async () => {
    const { code, out } = await run(["disable", "layla", "100"])
    expect(code).toBe(0)
    expect(seen[0]).toMatchObject({ method: "PATCH", body: { active: false } })
    expect(seen[0].url).toContain(`code_hash=eq.${sha("LAYLA100")}`)
    expect(out).toMatch(/Disabled "poster"/)
  })
})
