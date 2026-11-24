#!/usr/bin/env bash
# Find where the QOTD TCP server starts to suffer under "virtual hardware"
# limits: for each profile the image runs with docker --cpus/--memory, and k6
# raises the rate of QOTD exchanges step by step until the server degrades.
#
# A step counts as healthy when, at that rate:
#   - at least 99% of exchanges returned a quote,
#   - p95 latency stays at or under P95_LIMIT_MS,
#   - k6 achieved at least 95% of the requested rate (no backlog).
# The first unhealthy step ends the profile; its reason is recorded as
# {kind: errors (value: % failed) | latency (p95 ms) | throughput (served/s)
#  | stopped (container died) | generator (k6 failed), value}.
#
#   IMAGE   image to test (required)
#   K6      k6 binary with xk6-tcp (default: k6)
#   OUT     output JSON (default: perf-results/ci-load.json)
set -euo pipefail

IMAGE=${IMAGE:?set IMAGE}
K6=${K6:-k6}
OUT=${OUT:-perf-results/ci-load.json}
STEP_DURATION=${STEP_DURATION:-10s}
P95_LIMIT_MS=${P95_LIMIT_MS:-50}
RATES=${RATES:-"250 500 1000 2000 3000 4000 6000 8000 10000 12000 16000 20000"}
# name cpus memory
PROFILES=${PROFILES:-"tiny:0.1:32m small:0.25:64m medium:0.5:128m large:1:256m"}
PORT=18017
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
mkdir -p "$(dirname "$OUT")"

cleanup() { docker rm -f quotez-perf >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

wait_ready() {
  for _ in $(seq 1 50); do
    if (exec 3<>/dev/tcp/127.0.0.1/$PORT) 2>/dev/null; then return 0; fi
    sleep 0.2
  done
  echo "server did not start" >&2
  docker logs quotez-perf >&2 || true
  return 1
}

profiles_json="[]"
for profile in $PROFILES; do
  IFS=: read -r name cpus mem <<<"$profile"
  echo "== profile $name: $cpus vCPU, $mem RAM"
  docker rm -f quotez-perf >/dev/null 2>&1 || true
  docker run -d --name quotez-perf --cpus "$cpus" --memory "$mem" --memory-swap "$mem" \
    ${ULIMIT:---ulimit nofile=65536:65536} -p 127.0.0.1:$PORT:8017 "$IMAGE" >/dev/null
  wait_ready
  sleep 1

  levels="[]"
  best=0
  suffering="null"
  for rate in $RATES; do
    summary="$WORK/$name-$rate.json"
    TARGET=127.0.0.1:$PORT RATE=$rate DURATION=$STEP_DURATION MAX_VUS=$(( rate < 500 ? 500 : rate )) OUT=$summary \
      "$K6" run --quiet --no-usage-report "$SCRIPT_DIR/qotd-tcp.js" >/dev/null 2>"$WORK/k6.log" || true
    if [ ! -s "$summary" ]; then
      echo "k6 produced no summary at $rate/s" >&2
      tail -20 "$WORK/k6.log" >&2
      suffering=$(jq -n --argjson r "$rate" '{rate: $r, kind: "generator", value: null}')
      break
    fi
    mem_mib=$(docker stats --no-stream --format '{{.MemUsage}}' quotez-perf | awk '{print $1}')
    alive=$(docker inspect -f '{{.State.Running}}' quotez-perf)
    level=$(jq --arg mem "$mem_mib" --argjson alive "$alive" '. + {memory_after: $mem, server_alive: $alive}' "$summary")
    echo "   $rate/s -> $(jq -c '{achieved_rate, ok_rate, p95: .latency_ms.p95, dropped}' <<<"$level") mem $mem_mib"
    levels=$(jq --argjson l "$level" '. + [$l]' <<<"$levels")

    # Why the step is unhealthy, as {kind, value}; empty when healthy
    reason=$(jq -c --argjson lim "$P95_LIMIT_MS" --argjson alive "$alive" '
      if ($alive | not) then {kind: "stopped", value: null}
      elif .ok_rate < 0.99 then {kind: "errors", value: (((1 - .ok_rate) * 1000 | round) / 10)}
      elif .latency_ms.p95 > $lim then {kind: "latency", value: (.latency_ms.p95 | round)}
      elif .achieved_rate < 0.95 * .target_rate then {kind: "throughput", value: (.achieved_rate | round)}
      else empty end' <<<"$level")
    if [ -n "$reason" ]; then
      suffering=$(jq -c --argjson r "$rate" '{rate: $r} + .' <<<"$reason")
      break
    fi
    best=$rate
  done

  profiles_json=$(jq --arg name "$name" --arg cpus "$cpus" --arg mem "$mem" --argjson best "$best" \
    --argjson suffering "$suffering" --argjson levels "$levels" \
    '. + [{name: $name, cpus: ($cpus | tonumber), memory: $mem, max_healthy_rate: $best, suffering: $suffering, levels: $levels}]' \
    <<<"$profiles_json")
  docker rm -f quotez-perf >/dev/null
done

jq -n \
  --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg commit "${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}" \
  --arg cpu "$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | sed 's/^ *//')" \
  --argjson nproc "$(nproc)" \
  --arg step "$STEP_DURATION" --argjson p95 "$P95_LIMIT_MS" \
  --argjson profiles "$profiles_json" \
  '{generated_at: $at, commit: $commit, protocol: "QOTD over TCP (RFC 865)",
    host: {cpu: $cpu, cores: $nproc},
    criteria: {step_duration: $step, p95_limit_ms: $p95, min_ok_rate: 0.99, min_achieved_ratio: 0.95},
    profiles: $profiles}' >"$OUT"
echo "wrote $OUT"
