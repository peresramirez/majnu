// Names and limits for the Daytona redesign ("designed for you"), shared by the
// job (lib/daytona/redesign.ts), the snapshot builder
// (scripts/daytona/build-snapshot.mts) and the page checker. No imports and no
// secrets, so plain Node scripts can load it too.
//
// How it fits together is in docs/plan.md, "Daytona redesign".

// The snapshot every redesign sandbox starts from. Rebuild it under a new name
// (majnu-letters-v4, ...) when the templates, the skill or the Claude Code
// version change, then move this default to it (or set DAYTONA_SNAPSHOT); running
// sandboxes keep the old one, and a bad build never replaces a working one.
export const DEFAULT_SNAPSHOT = "majnu-letters-v3"

// The API for our keys. DAYTONA_API_URL overrides it.
export const DEFAULT_API_URL = "https://app.daytona.io/api"

// Where snapshots are built and sandboxes run. The organization has no default
// region, so every call names one. Letters hold private messages from people
// in Germany, so they are processed in the EU. DAYTONA_TARGET overrides it.
export const DEFAULT_TARGET = "eu"

// Pinned so a CLI release cannot change flags under us. This is the version npm
// tagged `stable` when the snapshot was defined.
export const CLAUDE_CODE_VERSION = "2.1.323"

// Inside the sandbox.
export const SANDBOX_HOME = "/home/daytona"
export const PROJECT_DIR = `${SANDBOX_HOME}/letter`
export const INPUT_DIR = `${PROJECT_DIR}/input`
export const OUTPUT_FILE = `${PROJECT_DIR}/out/index.html`

// The only host the sandbox may reach: Claude Code talks to the Anthropic API
// and nothing else. Daytona enforces it on Tier 3 and 4 accounts; lower tiers
// refuse it and apply their own policy (lib/daytona/redesign.ts, createSandbox).
export const SANDBOX_DOMAIN_ALLOW_LIST = "api.anthropic.com"

// Limits on one Claude Code run. Claude Code 2.1.323 has no turn limit flag,
// so a run is bounded by what it may spend (--max-budget-usd) and by time. The
// time limit is enforced twice: by `timeout` inside the sandbox and by the SDK
// call that waits for it.
export const MAX_BUDGET_USD = 3
export const RUN_TIME_LIMIT_SECONDS = 360
// A design benefits from some thought; the chat agents run at low effort
// because they must answer fast, which this job does not.
export const CLAUDE_EFFORT = "medium"
// The sandbox destroys itself this long after it was created, whatever state
// it is in: the backstop if the job dies before its own delete runs.
export const SANDBOX_TTL_MINUTES = 20
// The snapshot's size, as scripts/daytona/build-snapshot.mts builds it (one
// vCPU, GiB of memory and disk): what a sandbox minute costs
// (lib/providers/costs.ts, for the fallback key's cap).
export const SANDBOX_RESOURCES = { cpu: 1, memory: 2, disk: 3 } as const
// What one Claude Code run may cost on the fallback Anthropic key, reserved
// against its monthly cap before the run: the budget, plus room for the last
// turn that takes it over.
export const CLAUDE_RUN_RESERVE_USD = MAX_BUDGET_USD * 1.5

// What we accept back. The table has the same cap (0003_letter_designs.sql).
export const MAX_DESIGN_BYTES = 500 * 1024
export const MIN_DESIGN_BYTES = 200
export const MAX_REQUEST_CHARS = 2000

// The one script a design may load: our pinned copy of three.js, one minified
// ES module made by scripts/daytona/vendor-three.mts and served from public/
// with long-lived cache headers (public/_headers). A design imports it by this
// root-relative path, which resolves against /l/<slug>/design on whatever host
// serves it; the design CSP allows exactly this file, and the checker
// (lib/daytona/validate.ts) refuses every other import. Published versions are
// never overwritten: stored designs import them by URL. A new version gets a
// new folder, a new hash here and a new snapshot.
export const THREE_VERSION = "0.187.0"
export const THREE_MODULE_PATH = `/vendor/three/${THREE_VERSION}/three.module.min.js`
export const THREE_MODULE_SHA256 = "ea0b317604d082b1393cb2bbe5c6e5f97884a3b66eaa55cf55d89104f8779a2a"
// The bare name an import map may give it: `{"imports":{"three":"<path>"}}`.
export const THREE_SPECIFIER = "three"
