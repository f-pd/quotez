#!/usr/bin/env bash
# Starts what the end-to-end tests need: the QOTD service (zig-out/bin/quotez,
# built beforehand with `zig build`) and the website server on $PORT
# (default 3000), serving the build in website/dist. Runs in the foreground
# until stopped; Playwright starts it on its own when nothing answers yet.
#
#   bash e2e/stack.sh            # service + website on :3000
#   PORT=3001 WEB_ONLY=1 bash e2e/stack.sh   # one more website, same service
set -euo pipefail

web=$(cd "$(dirname "$0")/.." && pwd)
root=$(cd "$web/.." && pwd)
tmp=${E2E_TMP:-$(mktemp -d)}
port=${PORT:-3000}
pids=()
trap 'kill "${pids[@]}" 2>/dev/null || true' EXIT

if [[ -z "${WEB_ONLY:-}" ]] && ! curl -fs localhost:8080/health >/dev/null 2>&1; then
  # Same quotes as the repository, unprivileged ports, quotes added through the
  # API kept out of the repository
  sed -e 's/= 17$/= 8017/' \
      -e "s|^\\[api\\]\$|[api]\\nquotes_path = \"$tmp/api-managed.json\"|" \
      "$root/quotez.toml" > "$tmp/quotez.toml"
  (cd "$root" && exec ./zig-out/bin/quotez "$tmp/quotez.toml") > "$tmp/quotez.log" 2>&1 &
  pids+=($!)
  for _ in $(seq 1 50); do curl -fs localhost:8080/health >/dev/null 2>&1 && break; sleep 0.2; done
fi

cd "$web"
QOTD_API_USERNAME=admin QOTD_API_PASSWORD=quotez \
  DB_PATH="$tmp/settings-$port.db" PORT="$port" \
  STATS_URL="http://127.0.0.1:9/stats.json" \
  bun run server.ts &
pids+=($!)
wait -n
