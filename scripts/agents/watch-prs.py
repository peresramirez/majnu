#!/usr/bin/env python3
"""Watch open pull requests for the lead session.

Prints one line whenever something the lead must act on changes: a pull
request is opened, its merge state changes (CLEAN, BEHIND, DIRTY, UNSTABLE,
BLOCKED), a check fails, its head moves, or it is merged or closed. Nothing is
printed while nothing changes.

The lead runs it with Claude Code's Monitor tool, so every printed line wakes
the lead the moment a task session opens or updates a pull request:

    python3 -I scripts/agents/watch-prs.py [seconds between polls, default 45]
"""
import json
import subprocess
import sys
import time

FIELDS = "number,title,headRefName,headRefOid,mergeStateStatus,statusCheckRollup"
FAILED = {"FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED"}


def open_pull_requests():
    out = subprocess.run(
        ["gh", "pr", "list", "--state", "open", "--json", FIELDS],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip())
    return json.loads(out.stdout or "[]")


def describe(pr):
    checks = pr.get("statusCheckRollup") or []
    failed = sorted({c.get("name") or "?" for c in checks if c.get("conclusion") in FAILED})
    running = any(c.get("status") not in (None, "COMPLETED") for c in checks)
    state = pr.get("mergeStateStatus") or "UNKNOWN"
    if running:
        state += " (checks running)"
    return (pr["headRefOid"], state, tuple(failed))


def main():
    interval = int(sys.argv[1]) if len(sys.argv) > 1 else 45
    seen = {}
    while True:
        try:
            prs = open_pull_requests()
        except Exception as error:  # a failed poll must not stop the watch
            print(f"watch-prs: GitHub poll failed ({str(error)[:80]}); retrying", file=sys.stderr, flush=True)
            time.sleep(interval)
            continue
        now = set()
        for pr in prs:
            number = pr["number"]
            now.add(number)
            state = describe(pr)
            if seen.get(number) != state:
                kind = "opened" if number not in seen else "changed"
                head, merge_state, failed = state
                print(
                    f"PR #{number} {kind}: {pr['headRefName']} | {merge_state} | head {head[:7]}"
                    f" | failed checks: {', '.join(failed) or 'none'} | {pr['title']}",
                    flush=True,
                )
                seen[number] = state
        for number in list(seen):
            if number not in now:
                print(f"PR #{number} merged or closed", flush=True)
                del seen[number]
        time.sleep(interval)


if __name__ == "__main__":
    main()
