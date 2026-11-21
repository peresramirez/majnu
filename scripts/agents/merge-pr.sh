#!/usr/bin/env bash
# The lead's merge step for one pull request (AGENTS.md, "Working in parallel").
#
#   scripts/agents/merge-pr.sh <number> ["merge commit subject"]
#
# 1. If the branch is behind main, bring main into it on GitHub (gh pr update-branch),
#    so the checks run on exactly what will land.
# 2. Wait for the checks; rerun a failed job once (for flaky network steps).
# 3. Merge only when GitHub says CLEAN and the branch is not behind main.
# 4. Pull main and run the type check and unit tests on it.
# Exits non-zero, without merging, when any condition is not met.
set -uo pipefail

n="${1:?usage: merge-pr.sh <number> [subject]}"
subject="${2:-}"
root="$(git rev-parse --show-toplevel)"
repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
branch="$(gh pr view "$n" --json headRefName -q .headRefName)"

behind() { gh api "repos/$repo/compare/main...$branch" --jq .behind_by; }
state() { gh pr view "$n" --json mergeStateStatus -q .mergeStateStatus; }

b="$(behind)"
if [ "$b" != 0 ]; then
  gh pr update-branch "$n" >/dev/null && echo "brought main into $branch ($b commits)"
  sleep 20
fi

gh pr checks "$n" --watch --interval 20 >/dev/null 2>&1
s="$(state)"
if [ "$s" != CLEAN ]; then
  run="$(gh pr view "$n" --json statusCheckRollup -q '[.statusCheckRollup[] | select(.conclusion=="FAILURE") | .detailsUrl][0] // ""' | grep -oE 'runs/[0-9]+' | cut -d/ -f2)"
  if [ -n "$run" ]; then
    echo "rerunning failed run $run once"
    gh run rerun "$run" --failed >/dev/null
    sleep 20
    gh run watch "$run" --interval 20 >/dev/null 2>&1
    sleep 10
    s="$(state)"
  fi
fi

b="$(behind)"
echo "PR #$n: $s, behind main by $b"
if [ "$s" != CLEAN ] || [ "$b" != 0 ]; then
  echo "not merging #$n"
  exit 1
fi

if [ -n "$subject" ]; then
  gh pr merge "$n" --merge --subject "$subject" >/dev/null
else
  gh pr merge "$n" --merge >/dev/null
fi
echo "merged #$n"

cd "$root"
git pull -q --ff-only origin main
git log --oneline -1
npm ci --no-audit --no-fund >/dev/null 2>&1
echo "typecheck errors: $(npm run typecheck 2>&1 | grep -c 'error TS')"
npm test 2>&1 | grep -E "Test Files|Tests |FAIL" | head -3
