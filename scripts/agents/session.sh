#!/usr/bin/env bash
# Parallel task sessions: one task = one branch = one git worktree = one Claude
# Code session in its own Herdr workspace. The lead session runs this script;
# the workflow is described in AGENTS.md ("Working in parallel") and CLAUDE.md
# ("Parallel sessions with Herdr").
#
#   scripts/agents/session.sh start <name> --port <port> --brief <file>
#   scripts/agents/session.sh status <name>
#   scripts/agents/session.sh close <name> [--force]
#
# start   creates branch task/<name> from main and a worktree in
#         .claude/worktrees/<name>, opens it as a Herdr workspace, copies the
#         gitignored keys and personal settings, installs dependencies, starts
#         Claude Code there with an isolated browser, and sends it
#         brief-header.md followed by the brief.
# status  prints the session's state and its latest output.
# close   after the branch is merged into main: ends the session, removes the
#         workspace, the worktree and the branch (local and on GitHub).
#         --force discards an unmerged branch.
set -euo pipefail

die() { echo "session.sh: $*" >&2; exit 1; }

[ "${HERDR_ENV:-}" = 1 ] || die "run this from a session inside Herdr (HERDR_ENV=1)"
command -v jq >/dev/null || die "jq is required"

root="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
here="$(cd "$(dirname "$0")" && pwd)"

cmd="${1:-}"
name="${2:-}"
[ -n "$cmd" ] && [ -n "$name" ] || die "usage: session.sh start|status|close <name> [options]"
shift 2
[[ "$name" =~ ^[a-z][a-z0-9-]{0,23}$ ]] || die "name: lowercase letters, digits and dashes, starting with a letter, at most 24 characters"

branch="task/$name"
path="$root/.claude/worktrees/$name"

workspace_of() {
  herdr worktree list --cwd "$root" | jq -r --arg p "$path" '.result.worktrees[] | select(.path == $p) | .open_workspace_id // empty'
}

case "$cmd" in
start)
  port=""
  brief=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --port) port="${2:-}"; shift 2 ;;
      --brief) brief="${2:-}"; shift 2 ;;
      *) die "unknown option $1" ;;
    esac
  done
  [[ "$port" =~ ^[0-9]{4}$ ]] || die "start needs --port <4-digit port>"
  [ -f "$brief" ] || die "start needs --brief <file>"

  # Each session runs Claude Code, a dev server, a production build and a browser.
  # Refuse to start one when the machine is already short of memory.
  min_free="${MAJNU_MIN_FREE_PCT:-30}"
  free_pct="$(memory_pressure 2>/dev/null | awk -F': ' '/free percentage/ {gsub("%","",$2); print $2}')"
  if [ -n "$free_pct" ] && [ "$free_pct" -lt "$min_free" ]; then
    die "only ${free_pct}% memory free (need ${min_free}%). Wait for a session to finish, or set MAJNU_MIN_FREE_PCT."
  fi
  git -C "$root" rev-parse --verify -q "refs/heads/$branch" >/dev/null && die "branch $branch already exists"
  [ -e "$path" ] && die "$path already exists"

  herdr worktree create --cwd "$root" --branch "$branch" --base main --path "$path" --label "$name" --no-focus >/dev/null
  ws="$(workspace_of)"
  [ -n "$ws" ] || die "Herdr did not open a workspace for $path"
  pane="$(herdr pane list --workspace "$ws" | jq -r '.result.panes[0].pane_id')"

  # The same keys and personal settings as the main checkout; both are gitignored.
  for f in .env.local .claude/settings.local.json; do
    if [ -f "$root/$f" ]; then
      mkdir -p "$path/$(dirname "$f")"
      cp "$root/$f" "$path/$f"
    fi
  done

  # Install dependencies before the agent starts. The marker is computed by the
  # shell, so the typed command line itself cannot match it.
  herdr pane run "$pane" 'npm ci --no-audit --no-fund && echo "SESSION_$((1+1))_READY" || echo "SESSION_$((1+1))_FAILED"' >/dev/null
  herdr pane wait-output "$pane" --regex 'SESSION_2_(READY|FAILED)' --source recent-unwrapped --timeout 600000 >/dev/null
  herdr pane read "$pane" --source recent-unwrapped --lines 5 | grep -q SESSION_2_READY || die "npm ci failed in $path; see the $name workspace"

  # The marker can print a moment before the shell is back at its prompt, and
  # Herdr only starts an agent in an idle shell, so retry while the pane is busy.
  err="$(mktemp)"
  started=0
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if herdr agent start "$name" --kind claude --pane "$pane" --timeout 90000 -- \
      --name "$name" --dangerously-skip-permissions --no-chrome --mcp-config scripts/agents/browser-mcp.json >/dev/null 2>"$err"; then
      started=1
      break
    fi
    grep -q agent_pane_busy "$err" || { cat "$err" >&2; rm -f "$err"; die "could not start Claude Code in $pane"; }
    sleep 2
  done
  rm -f "$err"
  [ "$started" = 1 ] || die "pane $pane stayed busy; start the agent by hand"

  prompt="$(sed -e "s/{{name}}/$name/g" -e "s/{{port}}/$port/g" "$here/brief-header.md")
$(cat "$brief")"
  herdr agent prompt "$name" "$prompt" >/dev/null
  # Return only once the session has picked the brief up, so a following
  # `herdr agent wait` does not see the idle state from before the prompt.
  herdr agent wait "$name" --until working --timeout 60000 >/dev/null || true

  jq -n --arg name "$name" --arg branch "$branch" --arg path "$path" --arg workspace "$ws" --arg pane "$pane" --arg port "$port" \
    '{name: $name, branch: $branch, path: $path, workspace: $workspace, pane: $pane, port: ($port | tonumber)}'
  ;;

status)
  herdr agent get "$name" | jq '.result'
  herdr agent read "$name" --source recent-unwrapped --lines 60
  ;;

close)
  force=0
  [ "${1:-}" = "--force" ] && force=1
  if [ "$force" = 0 ] && ! git -C "$root" merge-base --is-ancestor "$branch" main; then
    die "$branch is not merged into main. Merge it first, or pass --force to discard it."
  fi
  ws="$(workspace_of)"
  if [ -n "$ws" ]; then
    if [ "$force" = 1 ]; then herdr worktree remove --workspace "$ws" --force >/dev/null; else herdr worktree remove --workspace "$ws" >/dev/null; fi
  fi
  if [ -d "$path" ]; then
    if [ "$force" = 1 ]; then git -C "$root" worktree remove --force "$path"; else git -C "$root" worktree remove "$path"; fi
  fi
  if git -C "$root" rev-parse --verify -q "refs/heads/$branch" >/dev/null; then
    if [ "$force" = 1 ]; then git -C "$root" branch -D "$branch"; else git -C "$root" branch -d "$branch"; fi
  fi
  if git -C "$root" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
    git -C "$root" push origin --delete "$branch"
  fi
  echo "closed $name"
  ;;

*)
  die "unknown command $cmd (start, status or close)"
  ;;
esac
