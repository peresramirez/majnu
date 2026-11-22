// Builds the Daytona snapshot that every redesign sandbox starts from.
//
//   node scripts/daytona/build-snapshot.mts            # builds DAYTONA_SNAPSHOT or DEFAULT_SNAPSHOT (lib/daytona/config.ts)
//   node scripts/daytona/build-snapshot.mts --print    # prints the Dockerfile, builds nothing
//
// The snapshot holds Node, a pinned Claude Code CLI and the project Claude Code
// works in (daytona/sandbox/: the majnu-letter skill, CLAUDE.md, permissions and
// rendered examples), plus the template sources it reads for reference. It
// holds no keys: the Anthropic key is passed to each run's command only.
//
// Snapshots are immutable by name. When the templates, the skill or the CLI
// version change, build a new name (DAYTONA_SNAPSHOT=majnu-letters-v3) and move
// DEFAULT_SNAPSHOT to it. Refresh the rendered examples first with
// scripts/daytona/export-references.mts. Building takes a few minutes and
// spends Daytona credit.
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Daytona, Image } from "@daytona/sdk"
import { CLAUDE_CODE_VERSION, DEFAULT_API_URL, DEFAULT_SNAPSHOT, DEFAULT_TARGET, PROJECT_DIR, SANDBOX_HOME } from "../../lib/daytona/config.ts"

// Local paths below are relative to the repository root, as the build context
// mirrors them (and the Dockerfile then shows no local machine paths).
process.chdir(fileURLToPath(new URL("../../", import.meta.url)))
if (existsSync(".env.local")) process.loadEnvFile(".env.local")

const name = process.env.DAYTONA_SNAPSHOT?.trim() || DEFAULT_SNAPSHOT
const reference = `${PROJECT_DIR}/reference`

const image = Image.base("node:22-bookworm-slim")
  .runCommands(
    "apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*",
    `npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} && npm cache clean --force && claude --version`,
    `useradd --create-home --home-dir ${SANDBOX_HOME} --shell /bin/bash daytona`,
  )
  // Not secrets: they keep Claude Code from updating itself or sending
  // anything but model requests, which the sandbox firewall would block anyway.
  .env({
    DISABLE_AUTOUPDATER: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    DISABLE_TELEMETRY: "1",
    DISABLE_ERROR_REPORTING: "1",
  })
  .addLocalDir("daytona/sandbox", PROJECT_DIR)
  .addLocalDir("components/letters", `${reference}/components/letters`)
  .addLocalDir("components/calendars", `${reference}/components/calendars`)
  .addLocalFile("lib/letters/schema.ts", `${reference}/lib/letters/schema.ts`)
  .addLocalFile("lib/letters/fixtures.ts", `${reference}/lib/letters/fixtures.ts`)
  .runCommands(`mkdir -p ${PROJECT_DIR}/input ${PROJECT_DIR}/out && chown -R daytona:daytona ${SANDBOX_HOME}`)
  .dockerfileCommands(["USER daytona"])
  .workdir(PROJECT_DIR)

if (process.argv.includes("--print")) {
  console.log(image.dockerfile)
  process.exit(0)
}

const apiKey = process.env.DAYTONA_API_KEY?.trim()
if (!apiKey) throw new Error("DAYTONA_API_KEY must be set (in .env.local)")
const target = process.env.DAYTONA_TARGET?.trim() || DEFAULT_TARGET
const daytona = new Daytona({ apiKey, apiUrl: process.env.DAYTONA_API_URL?.trim() || DEFAULT_API_URL, target })

const existing = await daytona.snapshot.get(name).catch(() => null)
if (existing) {
  console.error(`Snapshot ${name} already exists (${existing.state}). Build a new name instead: DAYTONA_SNAPSHOT=<next name>`)
  process.exit(1)
}

console.log(`Building snapshot ${name} in ${target} with Claude Code ${CLAUDE_CODE_VERSION}...`)
const started = Date.now()
const snapshot = await daytona.snapshot.create(
  {
    name,
    image,
    // One CPU is plenty: Claude Code mostly waits on the model.
    resources: { cpu: 1, memory: 2, disk: 3 },
    // The node image's default command is a REPL that exits at once; a
    // sandbox needs a process that stays up.
    entrypoint: ["sleep", "infinity"],
  },
  { onLogs: (chunk) => process.stdout.write(chunk.endsWith("\n") ? chunk : `${chunk}\n`) },
)
console.log(`Snapshot ${snapshot.name} is ${snapshot.state} after ${Math.round((Date.now() - started) / 1000)} s`)
