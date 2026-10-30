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

Create a `quotez.toml` file:

```toml
[server]
host = "0.0.0.0"
tcp_port = 17
udp_port = 17

[quotes]
directories = ["/data/quotes"]
mode = "random"  # random | sequential | random-no-repeat | shuffle-cycle

[polling]
interval_seconds = 60
```

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

All `/api/*` endpoints require **Basic HTTP Authentication**. Configure credentials in the `[api]` section of `quotez.toml`.

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
| `/api/maintenance` | POST | Toggle maintenance mode |

## Website

A modern web interface for browsing quotes and managing the service.

### Features

- **Public Showcase**: Zen, Rich, and Simple display modes for quotes.
- **Admin Backoffice**: Full quote CRUD, service status monitoring, and runtime configuration.
- **Tech Stack**: React SPA powered by Vite, with a Bun-based backend server.

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

## Docker

```bash
# Build and run the Zig service
docker build -t quotez-service:latest .
docker run -d -p 17:17/tcp -p 17:17/udp -p 8080:8080 quotez-service:latest

# Build and run the Website
cd website
docker build -t quotez-web:latest .
docker run -d -p 3000:3000 -e QOTD_API_HOST=host.docker.internal quotez-web:latest
```

## Deployment

The project includes a Helm chart for Kubernetes deployment, managing both the Zig nanoservice and the web interface.

```bash
helm install my-quotez ./helm/quotez
```

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
├── src/                  # React SPA source code
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

MIT
