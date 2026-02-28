# Eidos Headless Server

Headless Eidos server with Graft sync support. Run your Eidos space as a server and access it via HTTP API.

## Quick Start

### Docker Deployment

The simplest way to run the server is using Docker. We recommend using the provided `docker-compose.yml` or running the container manually.

> [!NOTE]
> The Docker image uses `ubuntu:24.04` as the base image to ensure compatibility with `glibc 2.38+` required by the SQLite extensions.

#### 1. Configuration (`.env`)

Create a `.env` file in `apps/headless`:

```env
# S3 Credentials (Required for Sync)
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_ENDPOINT=https://s3.example.com
S3_BUCKET_NAME=your-bucket
S3_PREFIX=your-prefix
S3_FILES_PREFIX=your-files-prefix

# Server Config
PORT=3000
HOST=0.0.0.0
# Important: Set DATA_DIR to /data for Docker
DATA_DIR=/data

# Optional: API Key Authentication
API_KEY=your-secret-api-key

# Optional: Hostname Patterns (for Cloudflare/Production)
# EXTENSION_HOSTNAME_PATTERN="^([a-zA-Z0-9-]+)--([a-zA-Z0-9-]+)\\.yourdomain\\.com$"
# SANDBOX_HOSTNAME_PATTERN="^sb--([a-zA-Z0-9-]+)\\.yourdomain\\.com$"

# Optional: Compiled UI Directory
# COMPILED_UI_DIR=/app/compiled-ui
```

#### 2. Run with Docker Compose (Recommended)

```bash
cd apps/headless
docker compose up -d --build
```

#### 4. Run with GHCR Image (Pre-built)

If you prefer to use the pre-built image from GitHub Container Registry:

```bash
docker pull ghcr.io/mayneyao/eidos/headless:latest
docker run -it --rm \
  -p 3000:3000 \
  --env-file apps/headless/.env \
  --name eidos-headless \
  ghcr.io/mayneyao/eidos/headless:latest
```

### Local Development

> [!IMPORTANT]
> **Node.js Version**: This project requires Node.js **v20** or higher.
> If you encounter `NODE_MODULE_VERSION` mismatch errors after `pnpm install`, you must rebuild the native binaries to match your current Node.js version.

```bash
# Install dependencies
pnpm install

# Rebuild native binaries (if pnpm rebuild fails or for troubleshooting)
pnpm rebuild @eidos.space/better-sqlite3

# Or use the direct command if needed
cd node_modules/.pnpm/@eidos.space+better-sqlite3@11.9.3/node_modules/@eidos.space/better-sqlite3 && npm run build-release

# Copy SQLite extensions from desktop build
cp -r ../desktop/dist-sqlite-ext ./extensions
```

## SQLite Extensions

The server requires SQLite extensions for full functionality:

- `libsimple` - Full-text search (required)
- `libvec` - Vector search (optional)
- `libgraft` - Graft sync support (optional, required for sync)

Extensions are loaded from `SQLITE_EXTENSIONS_DIR` or auto-detected from:

- `/app/extensions` (Docker)
- `./extensions` or `./dist-sqlite-ext` (local)
- `apps/desktop/dist-sqlite-ext` (development)

## API Endpoints

| Method | Path                | Description                       |
| ------ | ------------------- | --------------------------------- |
| GET    | `/health`           | Health check                      |
| POST   | `/rpc`              | RPC API                           |
| GET    | `/files/*`          | File access                       |
| GET    | `/graft/status`     | Sync status                       |
| POST   | `/graft/pull`       | Pull from remote                  |
| POST   | `/graft/push`       | Push to remote                    |
| GET    | `*` (Match Pattern) | Extension Rendering (Server-side) |

## Extension Rendering

Headless server supports rendering Eidos blocks directly. It intercepts requests based on the hostnames:

- Default: `<extId>.block.<spaceId>.eidos.localhost`
- Production: Configurable via `EXTENSION_HOSTNAME_PATTERN`

When a request matches, the server handles:

1. Server-side rendering of the Extension HTML.
2. Serving `/app.js` (the compiled extension code).
3. Serving `/compiled-ui/*.js` (shared UI components).
4. Proxying external requests via `/proxy`.

## RPC Usage

````bash
# Query table data
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"method": "table(posts).findMany", "params": [{"where": {"published": true}}]}'

# Get document
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "doc.get", "params": ["doc-id"]}'

### Graft Operations (via RPC)

You can also perform Graft operations directly through the RPC API:

```bash
# Get sync status
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "db.status", "params": []}'

# Pull changes from remote
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "db.pull", "params": []}'

# Push changes to remote
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "db.push", "params": []}'

# Get database info
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "db.info", "params": []}'
````

```

## Environment Variables

> [!IMPORTANT]
> **Developer Tip**: When adding new environment variables, remember to register them in `apps/headless/src/config/env.ts` within the `HeadlessConfig` interface and `loadConfig` function. This ensures they are properly validated and logged at startup.


| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AWS_ACCESS_KEY_ID` | Yes* | - | S3 access key |
| `AWS_SECRET_ACCESS_KEY` | Yes* | - | S3 secret key |
| `AWS_ENDPOINT` | No | `https://s3.eidos.space` | S3 endpoint |
| `S3_BUCKET_NAME` | No | `eidos-sync` | S3 bucket name |
| `S3_PREFIX` | Yes* | - | Graft data path in S3 |
| `S3_FILES_PREFIX` | Yes* | - | File storage path in S3 |
| `S3_CUSTOM_DOMAIN` | No | - | Custom domain for R2 file access (e.g. `files.example.com`) |
| `PORT` | No | `3000` | Server port |
| `HOST` | No | `0.0.0.0` | Server host |
| `DATA_DIR` | No | `./data` | Local data directory |
| `API_KEY` | No | - | API Key for authentication |
| `SQLITE_EXTENSIONS_DIR` | No | auto-detect | Path to SQLite extensions |
| `COMPILED_UI_DIR` | No | `./compiled-ui` | Directory for shared UI components |
| `EXTENSION_HOSTNAME_PATTERN` | No | auto-detect | Regex for matching extension domains |
| `SANDBOX_HOSTNAME_PATTERN` | No | auto-detect | Regex for matching sandbox domains |

*Required for Graft sync

```
