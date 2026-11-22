// Imports the gift catalogue (issue #97; docs/features/gift-catalog.md) into
// the gift_catalog table (migration 0014), upserted by id with the service-role
// key from .env.local. Rows already in the table and not in the file are left
// as they are; set `active: false` in the file to take a gift off the finder.
//
//   npm run catalog:import -- path/to/gift_catalog.json            # writes
//   npm run catalog:import -- path/to/gift_catalog.json --dry-run  # checks only
//
// The file is a JSON array of
//   { id, groups[], occasions[], interests[], title, description, why, shop,
//     price, price_eur, url, image_url, checked_at, active? }
// Rows that fail a check are listed and skipped; nothing is written when none
// pass. Plain Node, no TypeScript, so it runs without a build.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

const GROUPS = new Set(["mother", "father", "partner", "best_friend", "sibling", "grandparent", "colleague", "child_teen", "cat", "dog", "bird", "general"])
const BATCH = 100

// npm passes flags after `--` as arguments; read them from argv only.
const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const file = args.find((arg) => !arg.startsWith("--"))
if (!file) {
  console.error("Usage: npm run catalog:import -- <gift_catalog.json> [--dry-run]")
  process.exit(1)
}

// KEY=value lines; values may be quoted. Nothing is printed.
function readEnv(path) {
  const env = {}
  let text
  try {
    text = readFileSync(path, "utf8")
  } catch {
    return env
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (!match) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    env[match[1]] = value
  }
  return env
}

const tag = (value) =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
const tags = (value) => (Array.isArray(value) ? [...new Set(value.filter((v) => typeof v === "string" && v.trim()).map(tag))] : [])
const text = (value, max) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null)
const https = (value) => (typeof value === "string" && /^https:\/\/\S+$/i.test(value.trim()) ? value.trim() : null)

// One row as the table takes it, or the reason it was skipped.
function toRow(item) {
  if (!item || typeof item !== "object") return { problem: "not an object" }
  const id = text(item.id, 120)
  if (!id) return { problem: "no id" }
  const groups = tags(item.groups).filter((group) => GROUPS.has(group))
  if (groups.length === 0) return { id, problem: `no known group in ${JSON.stringify(item.groups)}` }
  const title = text(item.title, 200)
  if (!title) return { id, problem: "no title" }
  const url = https(item.url)
  if (!url) return { id, problem: "no https url" }
  const priceEur = item.price_eur === null || item.price_eur === undefined || item.price_eur === "" ? null : Number(item.price_eur)
  if (priceEur !== null && (!Number.isFinite(priceEur) || priceEur < 0)) return { id, problem: `bad price_eur ${item.price_eur}` }
  const checkedAt = item.checked_at && !Number.isNaN(Date.parse(item.checked_at)) ? new Date(item.checked_at).toISOString() : null
  return {
    row: {
      id,
      groups,
      occasions: tags(item.occasions),
      interests: tags(item.interests),
      title,
      description: text(item.description, 600),
      why: text(item.why, 600),
      shop: text(item.shop, 120),
      price: text(item.price, 40),
      price_eur: priceEur === null ? null : Math.round(priceEur * 100) / 100,
      url,
      image_url: https(item.image_url),
      checked_at: checkedAt,
      active: item.active === false ? false : true,
    },
  }
}

const raw = JSON.parse(readFileSync(resolve(file), "utf8"))
if (!Array.isArray(raw)) {
  console.error("The file must hold a JSON array of gifts.")
  process.exit(1)
}

const rows = []
const seen = new Set()
let skipped = 0
for (const [index, item] of raw.entries()) {
  const result = toRow(item)
  if (!result.row) {
    skipped++
    console.warn(`skipped #${index}${result.id ? ` (${result.id})` : ""}: ${result.problem}`)
    continue
  }
  if (seen.has(result.row.id)) {
    skipped++
    console.warn(`skipped #${index} (${result.row.id}): duplicate id`)
    continue
  }
  seen.add(result.row.id)
  rows.push(result.row)
}

const byGroup = {}
for (const row of rows) for (const group of row.groups) byGroup[group] = (byGroup[group] ?? 0) + 1
console.log(`${rows.length} gifts to import, ${skipped} skipped. By group: ${JSON.stringify(byGroup)}`)
if (rows.length === 0) process.exit(1)
if (dryRun) {
  console.log("Dry run: nothing written.")
  process.exit(0)
}

const env = { ...readEnv(resolve(".env.local")), ...process.env }
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.")
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

let written = 0
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH)
  const { error } = await supabase.from("gift_catalog").upsert(batch, { onConflict: "id" })
  if (error) {
    console.error(`Import stopped after ${written} gifts: ${error.message}`)
    process.exit(1)
  }
  written += batch.length
}
const { count, error } = await supabase.from("gift_catalog").select("id", { count: "exact", head: true }).eq("active", true)
console.log(`Imported ${written} gifts.${error ? "" : ` The catalogue now has ${count} active gifts.`}`)
