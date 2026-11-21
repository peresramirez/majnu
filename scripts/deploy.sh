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

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

git -C "$root" archive "$ref" | tar -x -C "$work"
cd "$work"

echo "Deploying $(git -C "$root" rev-parse --short "$ref") from a clean copy"
npm ci --no-audit --no-fund
npx opennextjs-cloudflare build
npx opennextjs-cloudflare deploy
