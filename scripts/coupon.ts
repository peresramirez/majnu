// Coupon codes for the personalised wrapper (docs/features/coupons.md), from
// the command line, with the service-role key in .env.local:
//
//   npm run coupon -- create [--code CODE] [--uses N] [--days N] [--label text]
//   npm run coupon -- list
//   npm run coupon -- disable <code>
//
// `create` makes a random code (or takes the one given with --code, 6 to 24
// letters and digits, for printing on a poster), stores only its SHA-256 hash
// and prints the code once: it cannot be shown again, so copy it then. Without
// --uses a code works once; without --days it never expires. Each person can
// use a code once, however many uses it has. `list` shows each code's label,
// uses, expiry and whether it is active, never a code (the database does not
// have them). `disable` switches a code off; it then answers as invalid.
//
// npm keeps options it does not know for itself unless they come after `--`:
// `npm run coupon create --code LAYLA100` reaches this script as the bare
// words "create LAYLA100". Write `npm run coupon -- create --code LAYLA100`,
// or `--code=LAYLA100` (npm then passes the value on as npm_config_code).
//
// It writes to whichever Supabase project .env.local points at: the
// production project, on this team.
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"

type CodeModule = typeof import("../lib/billing/coupon-code")

const USAGE = `Usage:
  npm run coupon -- create [--code CODE] [--uses N] [--days N] [--label text]
  npm run coupon -- list
  npm run coupon -- disable <code>`

const MAX_USES = 100_000
const MAX_DAYS = 3650

function fail(message: string, code = 2): never {
  console.error(message)
  process.exit(code)
}

// "--uses 5 --label Launch test" → { uses: "5", label: "Launch test" }. A
// label may be several words; everything up to the next flag belongs to it.
function flags(args: string[], allowed: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const name = args[i]
    if (!name.startsWith("--") || !allowed.includes(name.slice(2))) fail(`Unknown option ${name}\n${USAGE}`)
    const words: string[] = []
    while (i + 1 < args.length && !args[i + 1].startsWith("--")) words.push(args[++i])
    if (words.length === 0) fail(`${name} needs a value\n${USAGE}`)
    out[name.slice(2)] = words.join(" ")
  }
  return out
}

const CREATE_OPTIONS = ["code", "uses", "days", "label"]

// Options npm kept for itself: `--uses=5` arrives as npm_config_uses=5, and
// `--uses 5` as npm_config_uses=true with "5" left among the words, where it
// can no longer be told which option it belonged to.
function npmOptions(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of CREATE_OPTIONS) {
    const value = process.env[`npm_config_${name}`]
    if (value === undefined || value === "") continue
    if (value === "true") fail(`npm kept --${name} for itself. Put -- before the command:\n  npm run coupon -- create --${name} ...`)
    out[name] = value
  }
  return out
}

function wholeNumber(value: string | undefined, name: string, max: number, fallback: number | null): number | null {
  if (value === undefined) return fallback
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) fail(`--${name} must be a whole number from 1 to ${max}`)
  return Number(value)
}

function when(iso: string | null): string {
  return iso ? iso.slice(0, 16).replace("T", " ") : "never"
}

async function main() {
  const root = fileURLToPath(new URL("../", import.meta.url))
  if (existsSync(`${root}.env.local`)) process.loadEnvFile(`${root}.env.local`)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceKey) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (in .env.local)")

  // The same normalising and hashing as the server (lib/billing/coupon-code.ts),
  // loaded by path because plain Node does not know the "@/" alias.
  const codes: CodeModule = await import(new URL("../lib/billing/coupon-code.ts", import.meta.url).href)
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const [command, ...rest] = process.argv.slice(2)

  if (command === "create") {
    const options = { ...npmOptions(), ...flags(rest, CREATE_OPTIONS) }
    let chosen: string | null = null
    if (options.code !== undefined) {
      chosen = codes.normaliseCouponCode(options.code)
      if (!chosen) fail(`--code must be ${codes.CHOSEN_MIN_LENGTH} to ${codes.CHOSEN_MAX_LENGTH} letters and digits (spaces and dashes are ignored)`)
    }
    const maxUses = wholeNumber(options.uses, "uses", MAX_USES, 1)!
    const days = wholeNumber(options.days, "days", MAX_DAYS, null)
    const label = options.label?.trim() || null
    if (label && label.length > 200) fail("--label must be at most 200 characters")
    const expiresAt = days === null ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

    // A clash of two random 72-bit codes will not happen; retrying costs nothing.
    // A chosen code that exists already is refused (disabled ones too).
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = chosen ?? codes.generateCouponCode()
      const hash = await codes.hashCouponCode(codes.normaliseCouponCode(code)!)
      const { error } = await db.from("coupons").insert({ code_hash: hash, label, max_uses: maxUses, expires_at: expiresAt })
      if (error?.code === "23505" && chosen) fail("That code exists already. Choose another, or disable it and choose another.", 1)
      if (error?.code === "23505") continue
      if (error) fail(`Could not create the code: ${error.message}`, 1)
      console.log(`New code (${chosen ? "only its hash is stored" : "shown once, copy it now"}):\n\n  ${code}\n`)
      console.log(`Label:   ${label ?? "(none)"}`)
      console.log(`Uses:    ${maxUses}`)
      console.log(`Expires: ${expiresAt ? `${when(expiresAt)} UTC` : "never"}`)
      return
    }
    fail("Could not create a unique code; try again.", 1)
  }

  if (command === "list") {
    if (rest.length > 0) fail(USAGE)
    const { data, error } = await db
      .from("coupons")
      .select("label, uses, max_uses, expires_at, active, created_at")
      .order("created_at", { ascending: false })
      .limit(200)
    if (error) fail(`Could not read the codes: ${error.message}`, 1)
    type Row = { label: string | null; uses: number; max_uses: number; expires_at: string | null; active: boolean; created_at: string }
    const rows = (data ?? []) as Row[]
    if (rows.length === 0) {
      console.log("No codes yet. Make one with: npm run coupon -- create")
      return
    }
    const now = Date.now()
    const header = ["created (UTC)", "label", "uses", "expires (UTC)", "state"]
    const table = rows.map((r) => [
      when(r.created_at),
      r.label ?? "",
      `${r.uses}/${r.max_uses}`,
      when(r.expires_at),
      !r.active ? "disabled" : r.expires_at && Date.parse(r.expires_at) <= now ? "expired" : r.uses >= r.max_uses ? "used up" : "active",
    ])
    const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)))
    const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd()
    console.log(line(header))
    console.log(widths.map((w) => "-".repeat(w)).join("  "))
    for (const row of table) console.log(line(row))
    return
  }

  if (command === "disable") {
    const normalised = codes.normaliseCouponCode(rest.join(" "))
    if (!normalised) fail(`That is not a code.\n${USAGE}`)
    const { data, error } = await db
      .from("coupons")
      .update({ active: false })
      .eq("code_hash", await codes.hashCouponCode(normalised))
      .select("label, uses, max_uses")
    if (error) fail(`Could not disable the code: ${error.message}`, 1)
    const row = (data ?? [])[0] as { label: string | null; uses: number; max_uses: number } | undefined
    if (!row) fail("No such code.", 1)
    console.log(`Disabled ${row.label ? `"${row.label}"` : "the code"} (${row.uses}/${row.max_uses} uses taken).`)
    return
  }

  fail(USAGE)
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error), 1))
