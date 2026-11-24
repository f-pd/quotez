# quotez

A tiny Zig 0.17.0 nanoservice implementing the Quote of the Day (RFC 865) protocol over TCP and UDP. It loads, normalizes, and deduplicates quotes from local files (txt/csv/json/toml/yaml) and serves them on demand. The MVP is local-file-backed and ships as a static binary in a minimal non-root container.

## Features

- **RFC 865 Compliant**: Full TCP and UDP QOTD protocol support
- **Multi-Format Support**: Automatically parses TXT, CSV, JSON, TOML, and YAML files
- **Deduplication**: Blake3-based content hashing eliminates duplicate quotes
- **Selection Modes**: Random, sequential, random-no-repeat, and shuffle-cycle
- **Hot Reload**: Polls directories for changes and reloads without restart
- **Minimal Footprint**: Static binary < 5MB, Docker image < 10MB
- **Zero Dependencies**: Pure Zig standard library implementation

## Quick Start

### Prerequisites

- Zig 0.17.0
- Bun (for website)
- Docker (optional, for container deployment)

### Build

```bash
# Development build
zig build

# Release build (static, optimized for size)
zig build -Doptimize=ReleaseSmall -Dtarget=x86_64-linux-musl

# Run tests
zig build test
```

### Configuration

There are two config files, one per way of running it:

- `quotez.toml`: local runs (`./zig-out/bin/quotez` from the repo root). Serves the bundled `quotes/` on port 17 (needs root or `CAP_NET_BIND_SERVICE`; change the ports to run unprivileged). Every field is commented.
- `quotez.docker.toml`: baked into the container image as `/quotez.toml`. QOTD on 8017 TCP/UDP (map host port 17 onto it), health on 8080, quotes from `/data/seed-quotes` plus the `/data/quotes` volume, API off. Production does not mount another file: it only sets environment variables (below).

### Run

```bash
# Run locally (requires quotez.toml in current directory)
./zig-out/bin/quotez

# Test with netcat
nc localhost 17              # TCP
echo "" | nc -u localhost 17 # UDP
```

## Additional repository assets

The repository also contains an HTTP API and website implementation, but they are outside the local-file-backed QOTD MVP boundary. The supported MVP deployment exposes only the TCP and UDP QOTD service.

### Authentication

All `/api/*` endpoints require **Basic HTTP Authentication**. Credentials can be set in the `[api]` section of `quotez.toml`, but in production they should come from the environment, which overrides the file:

| Variable | Meaning |
|----------|---------|
| `QOTD_API_USERNAME` / `QOTD_API_PASSWORD` | Credential values |
| `QOTD_API_USERNAME_FILE` / `QOTD_API_PASSWORD_FILE` | Path to a file holding the value (Docker/Compose secrets); a trailing newline is ignored |
| `QOTD_API_ENABLED` | `true`/`1` or `false`/`0`: turns the API on or off over `[api] enabled` (the image ships with it off) |

The plain variable wins over `_FILE`, which wins over the TOML value. Empty variables are ignored. The service refuses to start with the API enabled if a credential still starts with `CHANGE_ME`.

For the Dokploy Compose deployment `docker-compose.yml` sets `QOTD_API_ENABLED=true`; set `QOTD_API_USERNAME` and `QOTD_API_PASSWORD` in the service's **Environment** tab; `docker-compose.yml` passes them through and fails the deploy if they are missing. The website uses the same variable names, so one pair serves both.

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (unprotected) |
| `/ready` | GET | Readiness check (unprotected) |
| `/api/quotes` | GET | List all quotes |
| `/api/quotes` | POST | Add a new quote |
| `/api/quotes/:id` | PUT | Update an existing quote |
| `/api/quotes/:id` | DELETE | Delete a quote |
| `/api/status` | GET | Service status and metrics |
| `/api/config` | GET/PATCH | View or update runtime configuration |
| `/api/reload` | POST | Trigger immediate reload from disk |
| `/api/maintenance` | GET/POST | Maintenance mode: `{"enabled":bool,"message":"..."}`. While on, TCP/UDP clients get the message instead of a quote |
| `/api/debug` | GET/POST | Debug mode: `{"enabled":bool}`. Logs every request and appends selection details to QOTD replies |
| `/api/stats` | GET | Serving statistics: totals per protocol, requests per minute (last hour), most served quotes (`?top=N`) |
| `/api/stats/reset` | POST | Reset all counters |
| `/api/logs` | GET | Recent log lines (`?since=SEQ&limit=N&level=info`), used by the backoffice live tail |

### Public HTTP routes

Served on the health port (default 8080) without authentication, independent of `[api] enabled`. Tag and author filters exist only over HTTP.

| Route | Description |
|-------|-------------|
| `/help` | Plain-text description of every route |
| `/quote` | One random quote |
| `/n/:num` | `:num` distinct random quotes, 1 to 50 (larger values are clamped) |
| `/:locale/quote` | One random quote in that language, e.g. `/it/quote`, `/it-IT/quote` |
| `/:locale/n/:num` | `:num` quotes in that language, e.g. `/fr/n/5` |
| `/locales` | Supported languages and the default one |
| `/tags` | Every tag with the number of quotes carrying it |

`/quote` and `/n/:num` accept `tag=a,b` (every listed tag must match, the parameter can repeat) and `author=name` (case-insensitive substring; for plain-text quotes the author is read from a trailing ` - Author`). Responses are plain text, one quote per line, unless `format=json` or `Accept: application/json` is sent.

```bash
curl localhost:8080/n/5?tag=stoic
curl 'localhost:8080/quote?author=seneca&format=json'
```

### Languages

Every quote has an original language and optional translations. Languages are BCP 47 tags (`it`, `it-IT`, `fr`, `en-US`).

- Supported languages are configured in `quotez.toml` (default `en`, `it`, `fr`); `default` is the language assumed for quotes that do not declare one:
  ```toml
  [locales]
  supported = ["en", "it", "fr"]
  default = "en"
  ```
- The original language comes from a JSON `"lang"` field or from the file name (`seneca.it.txt`, `poems.pt_BR.json`). Translations are a JSON `"translations"` object, or are edited in the backoffice:
  `[{"text": "Fatti non foste a viver come bruti", "author": "Dante", "lang": "it", "translations": {"en": "You were not made to live as brutes", "fr": "..."}}]`
- `/it-IT/...` serves only text written in `it-IT` or, failing that, in `it`; `/it/...` also accepts regional Italian. Quotes with no text in the requested language are skipped and never shown in another language (404 when none is left). `?lang=it` works like the prefix. Without a locale, quotes are served in their original language.
- JSON replies carry `lang`, `original_lang`, `translated` and, for a translation, `original` with the text in its original language. The website uses it for its "Show original" button.
- `"work"` (the source) is a string or one description per language: `"work": {"en": "Grundlinien der Philosophie des Rechts (1820), Preface", "it": "... (1820), Prefazione"}`. Replies describe it in the requested language (titles stay in the original language); a language without its own description gets the English one.
- QOTD (port 17/8017) stays RFC 865: a client that sends nothing gets one quote in its original language. As an optional extension a client may send one line `[locale] [n count]`: `echo it | nc host 17`, `echo "it-IT n 3" | nc host 17` (UDP: the same text in the datagram). Over TCP the line must arrive within 300 ms of connecting (a newline or closing the write side ends it at once, as `echo ... | nc` does); a client that sends nothing gets its quote after that wait.
- RFC 865 asks for quotes shorter than 512 characters (ASCII), so any text or translation over 511 UTF-8 bytes is **web only**: it is served over HTTP but never selected on QOTD. The backoffice shows the byte count of every text and flags web-only ones.

### Tags

- Sub-folders of a quote directory become tags: `quotes/philosophy/stoic/seneca.txt` gives `philosophy` and `stoic`.
- JSON quote objects can set `author`, `category` and `tags` (array or comma-separated string):
  `[{"quote": "...", "author": "Seneca", "category": "Stoicism", "tags": ["time", "life"]}]`
- Tags are lowercased; spaces and underscores become `-`. When the same quote appears in several files, its tags are merged.

## Website

A modern web interface for browsing quotes and managing the service.

### Features

- **Public Showcase**: Zen, Rich, and Simple display modes for quotes.
- **Admin Backoffice**: Full quote CRUD, service status monitoring, and runtime configuration.
- **Tech Stack**: Solid SPA (TanStack Solid Router) built with Vite, with a Bun-based backend server.

### Setup and Run

```bash
cd website
bun install
bun run build
# Run with environment variables
QOTD_API_HOST=localhost QOTD_TCP_HOST=localhost PORT=3000 bun run server.ts
```

### Routes

- `/`: Public showcase with multiple display modes.
- `/admin`: Admin panel for service management.

## Quotes and blocked authors

The bundled quotes live in `quotes/` (one JSON file per theme: marxism,
anarchism, antifascism, anticolonialism, feminism, philosophy, literature,
politics). Each has its original text and language, en/it/fr translations and
a precise source; see [QUOTES_SOURCES.md](QUOTES_SOURCES.md) for sources,
licenses and translation credits.

Fascists, Nazis and far-right authors are blocked by a list compiled into the
service (`src/blocklist.zig`): matching quotes are skipped on load and the
backoffice API rejects them with `422`.

## Docker

```bash
# Build and run the Zig service
docker build -t quotez:latest .     # or pull ghcr.io/f-pd/quotez:latest
docker run -d -p 17:8017/tcp -p 17:8017/udp -p 8080:8080 quotez:latest
# with the API: -e QOTD_API_ENABLED=true -e QOTD_API_USERNAME=... -e QOTD_API_PASSWORD=...

# Build and run the Website
cd website
docker build -t quotez-web:latest .
docker run -d -p 3000:3000 -e QOTD_API_HOST=host.docker.internal quotez-web:latest
```

## Deployment

The project includes a Helm chart for Kubernetes deployment, managing both the Zig nanoservice and the web interface.

```bash
helm install my-quotez ./helm/quotez \
  --set global.api.username=admin --set global.api.password='<secret>'
```

The chart runs the image's built-in config too; API credentials go into a Secret shared by the service and the website (`--set global.api.enabled=false` to skip the API).

## Project Structure

```
src/
├── main.zig              # Entry point and event loop
├── config.zig            # TOML configuration parsing
├── logger.zig            # Structured logging
├── net.zig               # Shared IP and network utilities
├── quote_store.zig       # In-memory quote storage
├── selector.zig          # Selection mode algorithms
├── watcher.zig           # File system polling and hot reload
├── compat/
│   └── posix_net.zig     # Socket compatibility layer
├── parsers/
│   ├── parser.zig        # Format detection and dispatch
│   ├── txt.zig           # Plaintext parser
│   ├── csv.zig           # CSV parser
│   ├── json.zig          # JSON parser
│   ├── toml.zig          # TOML parser
│   └── yaml.zig          # YAML parser
└── servers/
    ├── http.zig          # REST API server
    ├── tcp.zig           # TCP QOTD server
    └── udp.zig           # UDP QOTD server

website/
├── src/                  # Solid SPA source code
├── server.ts             # Bun HTTP server and API proxy
├── Dockerfile            # Website container definition
└── package.json          # Node/Bun dependencies

helm/
└── quotez/               # Umbrella Helm chart for full deployment

tests/
├── integration/
│   └── protocol_test.zig # RFC 865 compliance tests
└── fixtures/
    └── quotes/           # Sample quote files for testing
```

## License

GPL-3.0. See [LICENSE](LICENSE).
