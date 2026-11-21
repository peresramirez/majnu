// Names and limits for the Daytona redesign ("designed for you"), shared by the
// job (lib/daytona/redesign.ts), the snapshot builder
// (scripts/daytona/build-snapshot.mts) and the page checker. No imports and no
// secrets, so plain Node scripts can load it too.
//
// How it fits together is in docs/plan.md, "Daytona redesign".

// The snapshot every redesign sandbox starts from. Rebuild it under a new name
// (majnu-letters-v2, ...) when the templates, the skill or the Claude Code
// version change, then point DAYTONA_SNAPSHOT at it; sandboxes already running
// keep the old one, and a bad build never replaces a working one.
export const DEFAULT_SNAPSHOT = "majnu-letters-v1"

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
// and nothing else. Everything else is blocked by the runner's firewall.
export const SANDBOX_DOMAIN_ALLOW_LIST = "api.anthropic.com"

// Limits on one Claude Code run. The time limit is enforced twice: by
// `timeout` inside the sandbox and by the SDK call that waits for it.
export const MAX_TURNS = 40
export const RUN_TIME_LIMIT_SECONDS = 360
// The sandbox destroys itself this long after it was created, whatever state
// it is in: the backstop if the job dies before its own delete runs.
export const SANDBOX_TTL_MINUTES = 20

// What we accept back. The table has the same cap (0003_letter_designs.sql).
export const MAX_DESIGN_BYTES = 500 * 1024
export const MIN_DESIGN_BYTES = 200
export const MAX_REQUEST_CHARS = 2000
