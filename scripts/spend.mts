// What the fallback API keys have spent this month and before, from the
// provider_spend table (supabase/migrations/0010_provider_spend.sql). Read
// only: it never changes a row.
//
//   npm run spend            this month and the five before it
//   npm run spend -- 2026-11 one month
//
// It reads with the service-role key in .env.local (the table has no access
// for anyone else) and prints amounts only, never a key. The amounts are the
// app's estimates from published prices (lib/providers/costs.ts); the
// providers' consoles show what was billed.
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"

const root = fileURLToPath(new URL("../", import.meta.url))
if (existsSync(`${root}.env.local`)) process.loadEnvFile(`${root}.env.local`)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (in .env.local)")
  process.exit(2)
}

const arg = process.argv[2]
if (arg && !/^\d{4}-\d{2}$/.test(arg)) {
  console.error("Usage: npm run spend [-- YYYY-MM]")
  process.exit(2)
}

// As fallbackCapUsd() in lib/providers/keys.ts, which cannot be imported here
// (it is server-only): FALLBACK_CAP_USD, default 150.
const rawCap = process.env.FALLBACK_CAP_USD?.trim()
const capValue = rawCap ? Number(rawCap) : 150
const cap = Number.isFinite(capValue) && capValue >= 0 ? capValue : 150

const KEYS = {
  anthropic: "ANTHROPIC_API_KEY_FALLBACK",
  openai: "OPENAI_API_KEY_FALLBACK",
  daytona: "DAYTONA_API_KEY_FALLBACK",
} as const

const now = new Date()
const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`
const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)).toISOString().slice(0, 10)

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
let query = db.from("provider_spend").select("provider, month, spent_usd, calls, refused, updated_at").order("month", { ascending: false }).order("provider")
query = arg ? query.eq("month", `${arg}-01`) : query.gte("month", from)
const { data, error } = await query
if (error) {
  console.error(`Could not read provider_spend: ${error.message}`)
  process.exit(1)
}

type Row = { provider: keyof typeof KEYS; month: string; spent_usd: string | number; calls: number; refused: number; updated_at: string }
const rows = (data ?? []) as Row[]

console.log(`Fallback keys in .env.local (cap ${dollars(cap)} each per month):`)
for (const [provider, name] of Object.entries(KEYS)) {
  console.log(`  ${provider.padEnd(10)} ${name.padEnd(28)} ${process.env[name]?.trim() ? "set" : "not set"}`)
}
console.log("")

if (rows.length === 0) {
  console.log(arg ? `No fallback spend recorded for ${arg}.` : "No fallback spend recorded in the last six months.")
  process.exit(0)
}

const header = ["month", "provider", "spent", "cap left", "calls", "refused", "last call (UTC)"]
const table = rows.map((row) => {
  const spent = Number(row.spent_usd)
  return [
    row.month.slice(0, 7) + (row.month === thisMonth ? " *" : ""),
    row.provider,
    dollars(spent),
    row.month === thisMonth ? dollars(Math.max(cap - spent, 0)) : "",
    String(row.calls),
    String(row.refused),
    row.updated_at.slice(0, 16).replace("T", " "),
  ]
})
const widths = header.map((h, i) => Math.max(h.length, ...table.map((r) => r[i].length)))
const line = (cells: string[]) => cells.map((c, i) => (i >= 2 && i <= 5 ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join("  ")
console.log(line(header))
console.log(widths.map((w) => "-".repeat(w)).join("  "))
for (const r of table) console.log(line(r))
console.log("\n* this month. Amounts are estimates from published prices; check each provider's console for the bill.")

function dollars(usd: number): string {
  return `$${usd.toFixed(usd < 10 ? 4 : 2)}`
}
