// k6 load test for the RFC 865 QOTD port (TCP).
//
// Each iteration is one QOTD exchange: connect, send an empty request line
// (the standard reply, without waiting for the optional request), read the
// quote, close. The scenario holds a constant arrival rate, so a server that
// slows down shows up as higher latency, dropped iterations and errors.
//
// Needs a k6 binary built with the xk6-tcp extension (see perf/README.md).
//
//   TARGET    host:port to test            (default 127.0.0.1:8017)
//   RATE      exchanges per second         (default 100)
//   DURATION  test length                  (default 15s)
//   MAX_VUS   upper bound of virtual users (default 2000)
//   OUT       file for the JSON summary    (default summary.json)
//   ABORT     "1" stops the test early once errors pass 5% (used on prod)

import tcp from 'k6/x/tcp';
import { Trend, Rate, Counter } from 'k6/metrics';

const TARGET = __ENV.TARGET || '127.0.0.1:8017';
const RATE = parseInt(__ENV.RATE || '100', 10);
const DURATION = __ENV.DURATION || '15s';
const MAX_VUS = parseInt(__ENV.MAX_VUS || '2000', 10);

const latency = new Trend('qotd_latency', true);
const ok = new Rate('qotd_ok');
const bytes = new Counter('qotd_bytes');

const thresholds = { qotd_ok: ['rate>0.99'] };
if (__ENV.ABORT === '1') {
  thresholds.qotd_ok = [{ threshold: 'rate>0.95', abortOnFail: true, delayAbortEval: '5s' }];
}

export const options = {
  discardResponseBodies: true,
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  scenarios: {
    qotd: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.min(MAX_VUS, Math.max(10, Math.ceil(RATE / 10))),
      maxVUs: MAX_VUS,
    },
  },
  thresholds,
};

export default function () {
  const start = Date.now();
  let conn = null;
  try {
    conn = tcp.connect(TARGET, 5000);
    tcp.writeLn(conn, '', 5000);
    let got = 0;
    // The server closes after the quote; read until then (quotes are < 512 bytes)
    // (reading past the end throws, which just means the reply is complete)
    for (let i = 0; i < 4; i++) {
      let chunk;
      try {
        chunk = tcp.read(conn, 1024, 5000);
      } catch (e) {
        if (got === 0) throw e;
        break;
      }
      const n = chunk ? chunk.length || chunk.byteLength || 0 : 0;
      if (n === 0) break;
      got += n;
      if (got >= 512) break;
    }
    bytes.add(got);
    ok.add(got > 0);
  } catch (e) {
    ok.add(false);
  } finally {
    if (conn) {
      try {
        tcp.close(conn);
      } catch (e) {
        /* already closed */
      }
    }
  }
  latency.add(Date.now() - start);
}

function metric(data, name, field) {
  const m = data.metrics[name];
  return m && m.values ? m.values[field] : undefined;
}

export function handleSummary(data) {
  const iterations = metric(data, 'iterations', 'count') || 0;
  const seconds = (data.state.testRunDurationMs || 1) / 1000;
  const out = {
    target_rate: RATE,
    achieved_rate: Math.round((iterations / seconds) * 10) / 10,
    iterations,
    dropped: metric(data, 'dropped_iterations', 'count') || 0,
    ok_rate: metric(data, 'qotd_ok', 'rate'),
    latency_ms: {
      avg: metric(data, 'qotd_latency', 'avg'),
      p50: metric(data, 'qotd_latency', 'med'),
      p95: metric(data, 'qotd_latency', 'p(95)'),
      p99: metric(data, 'qotd_latency', 'p(99)'),
      max: metric(data, 'qotd_latency', 'max'),
    },
    duration_s: Math.round(seconds * 10) / 10,
  };
  return {
    [__ENV.OUT || 'summary.json']: JSON.stringify(out, null, 2),
    stdout: JSON.stringify(out) + '\n',
  };
}
