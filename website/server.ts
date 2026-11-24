import { Database } from "bun:sqlite";
import { getQuote } from "./src/lib/qotd-client";
import { initDb, getSetting, setSetting, getAllSettings } from "./src/lib/settings";
import path from "node:path";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";

const QOTD_API_HOST = process.env.QOTD_API_HOST ?? "127.0.0.1";
const QOTD_API_PORT = parseInt(process.env.QOTD_API_PORT ?? "8080");
const QOTD_TCP_HOST = process.env.QOTD_TCP_HOST ?? "127.0.0.1";
const QOTD_TCP_PORT = parseInt(process.env.QOTD_TCP_PORT ?? "8017");
const QOTD_API_USERNAME = process.env.QOTD_API_USERNAME;
const QOTD_API_PASSWORD = process.env.QOTD_API_PASSWORD;
const PORT = parseInt(process.env.PORT ?? "3000");
const DB_PATH = process.env.DB_PATH ?? path.join(import.meta.dir, "data", "settings.db");

if (!QOTD_API_USERNAME || !QOTD_API_PASSWORD) {
  console.error("[server] FATAL: QOTD_API_USERNAME and QOTD_API_PASSWORD are required.");
  process.exit(1);
}

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(DB_PATH, { create: true });
console.log(`[server] SQLite database opened at ${DB_PATH}`);
initDb(db);

const distDir = path.join(import.meta.dir, "dist");

// Build and load-test measurements for the About page. CI publishes them to
// the perf-stats branch after every run on main; the server fetches and
// caches them, so visitors never contact GitHub themselves.
const STATS_URL =
  process.env.STATS_URL ?? "https://raw.githubusercontent.com/f-pd/quotez/perf-stats/stats.json";
const STATS_TTL_MS = 10 * 60 * 1000;
let statsCache: { body: string; at: number } | null = null;

async function serveStats(): Promise<Response> {
  const headers = { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" };
  if (statsCache && Date.now() - statsCache.at < STATS_TTL_MS) {
    return new Response(statsCache.body, { headers });
  }
  try {
    const res = await fetch(STATS_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = JSON.stringify(await res.json());
    statsCache = { body, at: Date.now() };
    return new Response(body, { headers });
  } catch (err) {
    console.warn("[server] stats unavailable:", err);
    if (statsCache) return new Response(statsCache.body, { headers });
    return new Response(JSON.stringify({ error: "Stats unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

const PUBLIC_ROUTE = /^(?:\/help|\/tags|\/locales|(?:\/[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8})*)?\/(?:quote|n\/[^/]*))$/;

function serviceUnavailable(): Response {
  return new Response(JSON.stringify({ error: "Service unavailable" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function validateAuthHeader(authHeader: string | null): boolean {
  if (!authHeader) return false;
  if (!authHeader.startsWith("Basic ")) return false;

  try {
    const encoded = authHeader.slice(6);
    const decoded = atob(encoded);
    const colonIdx = decoded.indexOf(":");
    if (colonIdx === -1) return false;

    const username = decoded.slice(0, colonIdx);
    const password = decoded.slice(colonIdx + 1);

    const expectedAuth = Buffer.from(`${QOTD_API_USERNAME}:${QOTD_API_PASSWORD}`);
    const receivedAuth = Buffer.from(`${username}:${password}`);

    if (expectedAuth.length !== receivedAuth.length) return false;
    return timingSafeEqual(expectedAuth, receivedAuth);
  } catch {
    return false;
  }
}

async function serveStatic(pathname: string): Promise<Response> {
  // Normalise path to prevent directory traversal
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(distDir, safePath === "/" ? "index.html" : safePath);

  const file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file);
  }

  const indexFile = Bun.file(path.join(distDir, "index.html"));
  if (await indexFile.exists()) {
    return new Response(indexFile, { headers: { "Content-Type": "text/html" } });
  }

  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>quotez</title></head>` +
      `<body><h1>quotez</h1><p>UI not built. Run <code>bun run build</code> inside <code>website/</code>.</p></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

async function proxyToZig(req: Request, pathname: string, search: string): Promise<Response> {
  const zigUrl = `http://${QOTD_API_HOST}:${QOTD_API_PORT}${pathname}${search}`;
  const authHeader = "Basic " + btoa(`${QOTD_API_USERNAME}:${QOTD_API_PASSWORD}`);

  const headers: Record<string, string> = {};
  for (const [key, value] of req.headers.entries()) {
    // Strip hop-by-hop headers that should not be forwarded
    const lower = key.toLowerCase();
    // Drop the browser's Authorization too: it is replaced below with the
    // service credentials, and keeping both would send a merged, invalid header.
    if (lower === "host" || lower === "connection" || lower === "keep-alive" || lower === "authorization") continue;
    headers[key] = value;
  }
  headers["Authorization"] = authHeader;

  try {
    const upstream = await fetch(zigUrl, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    });

    const respHeaders = new Headers();
    for (const [key, value] of upstream.headers.entries()) {
      const lower = key.toLowerCase();
      // Strip hop-by-hop headers that should not be forwarded
      if (lower === "connection" || lower === "keep-alive" || lower === "transfer-encoding") continue;
      respHeaders.set(key, value);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch (err) {
    console.error(`[server] Proxy error → ${zigUrl}:`, err);
    return serviceUnavailable();
  }
}

const server = Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);
    const { pathname, search } = url;

    if (pathname === "/stats.json" && req.method === "GET") {
      return serveStats();
    }

    if (pathname === "/qotd") {
      try {
        const quote = await getQuote(QOTD_TCP_HOST, QOTD_TCP_PORT);
        return new Response(quote, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      } catch (err) {
        console.error("[server] QOTD TCP error:", err);
        return serviceUnavailable();
      }
    }

    if (pathname === "/settings" || pathname.startsWith("/api/")) {
      const authHeader = req.headers.get("Authorization");
      if (!validateAuthHeader(authHeader)) {
        return unauthorized();
      }
    }

    if (pathname === "/settings") {
      if (req.method === "GET") {
        return Response.json(getAllSettings(db));
      }
      if (req.method === "PATCH") {
        try {
          const updates = (await req.json()) as Record<string, string>;
          for (const [key, value] of Object.entries(updates)) {
            setSetting(db, key, String(value));
          }
          return Response.json(getAllSettings(db));
        } catch (err) {
          console.error("[server] Settings PATCH error:", err);
          return new Response(JSON.stringify({ error: "Invalid request body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (pathname.startsWith("/api/")) {
      return proxyToZig(req, pathname, search);
    }

    // Public read-only routes served by the Zig service (no auth), also
    // with a BCP 47 locale prefix: /it/quote, /it-IT/n/5
    if (req.method === "GET" && PUBLIC_ROUTE.test(pathname)) {
      return proxyToZig(req, pathname, search);
    }

    return serveStatic(pathname);
  },

  error(err) {
    console.error("[server] Unhandled error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  },
});

console.log(`[server] Listening on http://localhost:${server.port}`);
console.log(`[server] Zig API proxy → http://${QOTD_API_HOST}:${QOTD_API_PORT}`);
console.log(`[server] QOTD TCP      → ${QOTD_TCP_HOST}:${QOTD_TCP_PORT}`);
