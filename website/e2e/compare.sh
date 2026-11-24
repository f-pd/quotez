#!/usr/bin/env bash
# Before/after comparison of the website against another commit (default
# origin/main): screenshots of the "visual" project and bundle size.
#
#   bash e2e/compare.sh [base-ref]
#
# The base is built in a temporary git worktree and served on :3001; this
# checkout is served on :3000. Both use the same QOTD service. Screenshots
# are recorded on the base, then this build is checked against them.
set -euo pipefail

web=$(cd "$(dirname "$0")/.." && pwd)
root=$(cd "$web/.." && pwd)
ref=${1:-origin/main}
tmp=$(mktemp -d)
basedir="$tmp/base"
pids=()
cleanup() {
  kill "${pids[@]}" 2>/dev/null || true
  git -C "$root" worktree remove --force "$basedir" 2>/dev/null || true
}
trap cleanup EXIT

echo "::group::Build base ($ref)"
git -C "$root" worktree add --detach "$basedir" "$ref"
(cd "$basedir/website" && bun install && bun run build)
echo "::endgroup::"

echo "::group::Build this checkout"
(cd "$web" && bun run build)
echo "::endgroup::"

# This build (and the QOTD service) on :3000, the base on :3001
E2E_TMP="$tmp" bash "$web/e2e/stack.sh" > "$tmp/head.log" 2>&1 &
pids+=($!)
for _ in $(seq 1 60); do curl -fs localhost:3000/locales >/dev/null 2>&1 && break; sleep 0.5; done
(cd "$basedir/website" && QOTD_API_USERNAME=admin QOTD_API_PASSWORD=quotez \
  DB_PATH="$tmp/settings-base.db" PORT=3001 STATS_URL="http://127.0.0.1:9/stats.json" \
  exec bun run server.ts) > "$tmp/base.log" 2>&1 &
pids+=($!)
for _ in $(seq 1 60); do curl -fs localhost:3001/locales >/dev/null 2>&1 && break; sleep 0.5; done

status=0
export SNAPSHOT_DIR="$tmp/snapshots"
cd "$web"
echo "::group::Record screenshots on the base"
BASE_URL=http://localhost:3001 npx playwright test --project=visual --update-snapshots --retries=0
echo "::endgroup::"
echo "Compare this build with the base"
BASE_URL=http://localhost:3000 npx playwright test --project=visual || status=1

bun run scripts/bundle-size.ts "$web/dist" "$basedir/website/dist" || status=1
exit $status
