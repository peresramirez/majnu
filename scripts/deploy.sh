#!/usr/bin/env bash
# Deploys the committed code to Cloudflare from a clean copy.
#
# Why not build in the working directory: the Cloudflare adapter reads every
# .env file at build time and writes the values into the Worker. Building here
# would upload the secrets in .env.local and bake http://localhost:3000 into
# the pages. A clean copy only has .env.production, which holds public values.
#
# Usage: npm run deploy            (deploys HEAD)
#        npm run deploy -- main    (deploys another commit or branch)
set -euo pipefail

ref="${1:-HEAD}"
root="$(git rev-parse --show-toplevel)"

if [ "$ref" = "HEAD" ] && [ -n "$(git -C "$root" status --porcelain)" ]; then
  echo "Uncommitted changes will not be deployed; only committed code is." >&2
fi

# Build next to the repository, not in the system temp folder: a build is about
# 1.5 GB, and the system disk on the developer's machine is nearly full. Copies
# left behind by an interrupted deploy are removed on the next run.
parent="${MAJNU_DEPLOY_DIR:-$(dirname "$root")}"
find "$parent" -maxdepth 1 -name '.majnu-deploy.*' -type d -mmin +30 -exec rm -rf {} + 2>/dev/null || true
work="$(mktemp -d "$parent/.majnu-deploy.XXXXXX")"
trap 'rm -rf "$work"' EXIT INT TERM

git -C "$root" archive "$ref" | tar -x -C "$work"
cd "$work"

# The Impressum and privacy policy must not go live with placeholder details.
if grep -nE '"\[[^]]+\]"' lib/legal.ts >&2; then
  echo "lib/legal.ts still has placeholders (above). Fill them in before deploying." >&2
  exit 1
fi

echo "Deploying $(git -C "$root" rev-parse --short "$ref") from a clean copy"
npm ci --no-audit --no-fund
npx opennextjs-cloudflare build
npx opennextjs-cloudflare deploy
