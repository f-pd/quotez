import { Database } from "bun:sqlite";
import { getQuote } from "./src/lib/qotd-client";
import { initDb, getSetting, setSetting, getAllSettings } from "./src/lib/settings";
import path from "node:path";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { renderQuoteImage, renderSiteImage } from "./src/lib/og";
import { clip, injectHead, siteText, splitAuthor, type PageMeta } from "./src/lib/meta";
import { aboutFor } from "./src/lib/about";

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

const PUBLIC_ROUTE = /^(?:\/help|\/tags|\/locales|(?:\/[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8})*)?\/(?:quote(?:\/[^/]+)?|n\/[^/]*))$/;

// ---------------------------------------------------------------------------
// Link previews: <head> tags per page and Open Graph images
// ---------------------------------------------------------------------------

/** Public origin for absolute URLs; else taken from the proxy headers */
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/+$/, "");

function originOf(req: Request, url: URL): string {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

const LOCALE_SEGMENT = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8})*$/;
const QUOTE_ID = /^[0-9a-f]{10}$/i;

function canonicalTag(raw: string): string {
  return raw
    .split(/[-_]/)
    .map((p, i) => (i === 0 ? p.toLowerCase() : p.length === 2 ? p.toUpperCase() : p.toLowerCase()))
    .join("-");
}

type LocalesInfo = { supported: string[]; default: string };
let localesCache: { info: LocalesInfo; at: number } | null = null;

async function zigJson<T>(pathname: string): Promise<{ status: number; body: T | null }> {
  try {
    const res = await fetch(`http://${QOTD_API_HOST}:${QOTD_API_PORT}${pathname}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    return { status: res.status, body: res.ok ? ((await res.json()) as T) : null };
  } catch {
    return { status: 503, body: null };
  }
}

async function supportedLocales(): Promise<LocalesInfo> {
  if (localesCache && Date.now() - localesCache.at < 5 * 60 * 1000) return localesCache.info;
  const { body } = await zigJson<LocalesInfo>("/locales?format=json");
  const info = body ?? localesCache?.info ?? { supported: ["en", "it", "fr"], default: "en" };
  localesCache = { info, at: Date.now() };
  return info;
}

function baseLang(tag: string): string {
  return (tag.split("-")[0] ?? tag).toLowerCase();
}

/** Supported locale for a tag: exact, else same language */
function matchLocale(tag: string, supported: string[]): string | null {
  return (
    supported.find((s) => s.toLowerCase() === tag.toLowerCase()) ??
    supported.find((s) => baseLang(s) === baseLang(tag)) ??
    null
  );
}

/** Locale for "/" from Accept-Language (the page itself decides on the client) */
function localeFromHeader(req: Request, info: LocalesInfo): string {
  const header = req.headers.get("accept-language") ?? "";
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim();
    if (!tag || !LOCALE_SEGMENT.test(tag)) continue;
    const m = matchLocale(canonicalTag(tag), info.supported);
    if (m) return m;
  }
  return info.default;
}

type PublicQuote = {
  id: string;
  text: string;
  author: string | null;
  work: string | null;
  lang: string;
  original_lang: string;
  langs?: string[];
};

async function fetchQuoteById(locale: string, id: string): Promise<PublicQuote | null> {
  const { body } = await zigJson<PublicQuote>(`/${encodeURIComponent(locale)}/quote/${encodeURIComponent(id)}?format=json`);
  return body;
}

/** Small LRU for rendered images: a shared link is fetched by many crawlers */
const OG_CACHE_MAX = 300;
const ogCache = new Map<string, Uint8Array>();
const ogPending = new Map<string, Promise<Uint8Array | null>>();

function cached(key: string, make: () => Promise<Uint8Array | null>): Promise<Uint8Array | null> {
  const hit = ogCache.get(key);
  if (hit) {
    ogCache.delete(key);
    ogCache.set(key, hit);
    return Promise.resolve(hit);
  }
  const pending = ogPending.get(key);
  if (pending) return pending;
  const p = make()
    .then((png) => {
      if (png) {
        ogCache.set(key, png);
        if (ogCache.size > OG_CACHE_MAX) ogCache.delete(ogCache.keys().next().value as string);
      }
      return png;
    })
    .finally(() => ogPending.delete(key));
  ogPending.set(key, p);
  return p;
}

function pngResponse(png: Uint8Array): Response {
  return new Response(png as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}

/** GET /og/:locale.png (site card) and /og/:locale/:id.png (quote card) */
async function serveOgImage(req: Request, url: URL): Promise<Response | null> {
  const m = /^\/og\/([^/]+?)(?:\/([^/]+?))?\.png$/.exec(url.pathname);
  if (!m || !LOCALE_SEGMENT.test(m[1]!)) return null;
  const locale = canonicalTag(m[1]!);
  const host = new URL(originOf(req, url)).host;
  const id = m[2];
  try {
    if (!id) {
      const png = await cached(`site:${baseLang(locale)}:${host}`, () => renderSiteImage(siteText(locale).tagline, host));
      return png ? pngResponse(png) : null;
    }
    if (!QUOTE_ID.test(id)) return null;
    const png = await cached(`q:${locale}:${id.toLowerCase()}:${host}`, async () => {
      const q = await fetchQuoteById(locale, id);
      if (!q) return null;
      const { text, author } = splitAuthor(q.text, q.author);
      return renderQuoteImage({ text, author, work: q.work }, host);
    });
    if (png) return pngResponse(png);
    return new Response("Not found", { status: 404 });
  } catch (err) {
    console.error("[server] og image error:", err);
    return new Response("Image unavailable", { status: 500 });
  }
}

/** Meta tags for an HTML page, or null for pages that keep the defaults (admin) */
async function pageMeta(req: Request, url: URL): Promise<PageMeta | null> {
  const origin = originOf(req, url);
  const parts = url.pathname.split("/").filter(Boolean);
  const info = await supportedLocales();

  // Shared quote: /:locale/q/:id
  if (parts.length === 3 && parts[1] === "q" && LOCALE_SEGMENT.test(parts[0]!) && QUOTE_ID.test(parts[2]!)) {
    const locale = canonicalTag(parts[0]!);
    const id = parts[2]!.toLowerCase();
    const supported = matchLocale(locale, info.supported);
    const q = supported ? await fetchQuoteById(locale, id) : null;
    if (q) {
      countVisit(req, id, supported!);
      const { text, author } = splitAuthor(q.text, q.author);
      const quoted = `“${text}”`;
      const title = author ? `${clip(quoted, 90)} — ${author}` : clip(quoted, 110);
      const description = clip([author ? `${quoted} — ${author}` : quoted, q.work].filter(Boolean).join(" · "), 300);
      // The same quote in every supported language it exists in
      const langs = info.supported.filter((s) =>
        (q.langs ?? [q.lang]).some((l) => l.toLowerCase() === s.toLowerCase() || baseLang(l) === s.toLowerCase()),
      );
      const href = (l: string) => `${origin}/${l}/q/${id}`;
      const original = langs.find((l) => baseLang(l) === baseLang(q.original_lang)) ?? langs[0] ?? locale;
      return {
        locale,
        title,
        description,
        url: href(locale),
        image: `${origin}/og/${locale}/${id}.png`,
        imageAlt: clip(author ? `${quoted} — ${author}` : quoted, 400),
        type: "article",
        alternates: [...langs.map((l): [string, string] => [l, href(l)]), ["x-default", href(original)]],
      };
    }
    // Unknown id: the page falls back to a random quote, previews show the site
  }

  if (parts[0] === "admin") return null;

  // Site pages: /, /about, /:locale, /:locale/about
  let locale: string | null = null;
  let rest = parts;
  if (parts[0] && parts[0] !== "about" && LOCALE_SEGMENT.test(parts[0])) {
    locale = matchLocale(canonicalTag(parts[0]), info.supported) ? canonicalTag(parts[0]) : null;
    rest = parts.slice(1);
  }
  const about = rest[0] === "about";
  const suffix = about ? "/about" : "";
  const pageLocale = locale ?? localeFromHeader(req, info);
  const text = siteText(pageLocale);
  return {
    locale: pageLocale,
    title: about ? aboutFor(pageLocale).title : `Quotez — ${text.tagline}`,
    description: text.description,
    url: `${origin}${locale ? `/${locale}` : ""}${suffix || (locale ? "" : "/")}`,
    image: `${origin}/og/${pageLocale}.png`,
    imageAlt: text.imageAlt,
    type: "website",
    alternates: [
      ...info.supported.map((l): [string, string] => [l, `${origin}/${l}${suffix}`]),
      ["x-default", `${origin}${suffix || "/"}`],
    ],
  };
}

// ---------------------------------------------------------------------------
// Counters for the backoffice, aggregated and anonymous (no IP, no cookie,
// no user agent stored): one row per quote id, language, kind and format.
//   visit: someone opened a shared link /:locale/q/:id (counted here, on the
//          server; link-preview crawlers and bots are left out)
//   image: the page generated a quote image (format 16:9, 4:3...), reported
//          by a beacon from the browser
// ---------------------------------------------------------------------------

const IMAGE_FORMATS = new Set(["16:9", "4:3", "1:1", "3:4", "9:16"]);

const bumpCounter = db.query(
  `INSERT INTO share_counts (quote_id, locale, kind, format, count, last_at)
   VALUES (?1, ?2, ?3, ?4, 1, datetime('now'))
   ON CONFLICT (quote_id, locale, kind, format)
   DO UPDATE SET count = count + 1, last_at = datetime('now')`,
);

/** Link-preview crawlers, search engines and other non-browser clients */
const BOT_UA =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|meta-externalagent|embedly|whatsapp|telegram|discord|slack|skype|vkshare|pinterest|linkedin|quora|redditbot|bingpreview|headless|lighthouse|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|undici|bun\//i;

function isHumanVisit(req: Request): boolean {
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) return false;
  // Browser prefetch / prerender is not a visit
  const purpose = `${req.headers.get("purpose") ?? ""} ${req.headers.get("sec-purpose") ?? ""}`;
  if (/prefetch|prerender/i.test(purpose)) return false;
  return true;
}

function countVisit(req: Request, id: string, locale: string): void {
  if (!isHumanVisit(req)) return;
  try {
    bumpCounter.run(id, locale, "visit", "");
  } catch (err) {
    console.error("[server] visit counter error:", err);
  }
}

/** Beacon from the page: { id, locale, format } for each generated image */
async function recordImage(req: Request): Promise<Response> {
  try {
    const raw = await req.text();
    if (raw.length > 512) return new Response(null, { status: 413 });
    const ev = JSON.parse(raw) as { id?: unknown; locale?: unknown; format?: unknown };
    const id = typeof ev.id === "string" ? ev.id.toLowerCase() : "";
    const format = typeof ev.format === "string" ? ev.format : "";
    const rawLocale = typeof ev.locale === "string" ? ev.locale : "";
    if (!QUOTE_ID.test(id) || !IMAGE_FORMATS.has(format) || !LOCALE_SEGMENT.test(rawLocale)) {
      return new Response(null, { status: 400 });
    }
    const locale = matchLocale(canonicalTag(rawLocale), (await supportedLocales()).supported);
    if (!locale) return new Response(null, { status: 400 });
    bumpCounter.run(id, locale, "image", format);
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 400 });
  }
}

function shareStats(): Response {
  const rows = db
    .query(`SELECT quote_id AS id, locale, kind, format, count, last_at FROM share_counts ORDER BY count DESC`)
    .all();
  return Response.json({ rows });
}

let indexHtml: { text: string; mtime: number } | null = null;

async function serveIndex(req: Request, url: URL): Promise<Response | null> {
  const file = Bun.file(path.join(distDir, "index.html"));
  if (!(await file.exists())) return null;
  if (!indexHtml || indexHtml.mtime !== file.lastModified) {
    indexHtml = { text: await file.text(), mtime: file.lastModified };
  }
  let html = indexHtml.text;
  try {
    const meta = await pageMeta(req, url);
    if (meta) html = injectHead(html, meta);
  } catch (err) {
    console.error("[server] meta error:", err);
  }
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", Vary: "Accept-Language" },
  });
}

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

async function serveStatic(req: Request, url: URL): Promise<Response> {
  const { pathname } = url;
  // Normalise path to prevent directory traversal
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");

  if (safePath !== "/" && safePath !== "/index.html") {
    const file = Bun.file(path.join(distDir, safePath));
    if (await file.exists()) {
      // Vite's hashed bundles never change; icons and manifest may
      const immutable = safePath.startsWith("/assets/");
      return new Response(file, {
        headers: { "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600" },
      });
    }
  }

  const page = await serveIndex(req, url);
  if (page) return page;

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

    // Share counters, kept by this server (not the Zig service)
    if (pathname === "/api/shares") {
      if (req.method === "GET") return shareStats();
      if (req.method === "DELETE") {
        db.run("DELETE FROM share_counts");
        return new Response(null, { status: 204 });
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

    if (pathname === "/stats/image" && req.method === "POST") {
      return recordImage(req);
    }

    if (req.method === "GET" && pathname.startsWith("/og/")) {
      const og = await serveOgImage(req, url);
      if (og) return og;
    }

    return serveStatic(req, url);
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
