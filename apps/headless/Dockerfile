# Eidos Headless Server Dockerfile
# Multi-stage build for Node.js with SQLite extensions

# Stage 1: Builder (use node:20 which has Node.js pre-installed)
FROM node:20 AS builder

# Install only missing tools (node:20 already has curl, ca-certificates, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends unzip \
    && npm install -g pnpm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package.json files for all packages to benefit from layer caching
COPY apps/headless/package.json ./apps/headless/
COPY packages/core/package.json ./packages/core/
COPY packages/ext-server/package.json ./packages/ext-server/
COPY packages/sandbox/package.json ./packages/sandbox/
COPY packages/v3/package.json ./packages/v3/
COPY packages/client/package.json ./packages/client/

# Copy scripts required for postinstall
COPY apps/headless/scripts ./apps/headless/scripts/

# Install dependencies for headless and its workspace dependencies
RUN pnpm install --filter @eidos.space/headless...

# Download Node.js prebuild for better-sqlite3 (the package only tries Electron by default)
# This avoids needing build-essential and compiling from source
RUN cd node_modules/.pnpm/@eidos.space+better-sqlite3*/node_modules/@eidos.space/better-sqlite3 \
    && npx prebuild-install -r node || echo "Prebuild not available, will compile later"

# Copy source code
COPY apps/headless ./apps/headless
COPY packages ./packages
COPY tsconfig.json ./

# Build the headless app
RUN pnpm --filter @eidos.space/headless build

# Download libsimple and run postinstall to get SQLite extensions
RUN pnpm --filter @eidos.space/headless run setup

# Deploy pruned production dependencies to /app/deploy
RUN pnpm --filter @eidos.space/headless deploy --prod --legacy /app/deploy

# Copy the prebuild binary to the deployed directory
RUN cp -r node_modules/.pnpm/@eidos.space+better-sqlite3*/node_modules/@eidos.space/better-sqlite3/prebuilds \
    /app/deploy/node_modules/.pnpm/@eidos.space+better-sqlite3*/node_modules/@eidos.space/better-sqlite3/ 2>/dev/null || \
    cp -r node_modules/.pnpm/@eidos.space+better-sqlite3*/node_modules/@eidos.space/better-sqlite3/build \
    /app/deploy/node_modules/.pnpm/@eidos.space+better-sqlite3*/node_modules/@eidos.space/better-sqlite3/ 2>/dev/null || \
    echo "No prebuild found, need to compile"

# Stage 2: Production (minimal)
FROM ubuntu:24.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Only install essential runtime dependencies
# libstdc++6 is already included in ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy Node.js from builder (node:20 puts it in /usr/local)
COPY --from=builder /usr/local/bin/node /usr/local/bin/node

WORKDIR /app

# Copy deployed application
COPY --from=builder /app/deploy/package.json ./
COPY --from=builder /app/deploy/node_modules ./node_modules
COPY --from=builder /app/apps/headless/dist ./dist
COPY --from=builder /app/apps/headless/dist-sqlite-ext /app/extensions
COPY apps/web-app/public/compiled-ui ./compiled-ui

# Create data directory with correct permissions
# Remove default ubuntu user (UID 1000) so we can reuse the ID for node
RUN userdel -r ubuntu || true \
    && groupadd -g 1000 node \
    && useradd -u 1000 -g node -s /bin/sh -m node \
    && mkdir -p /data && chown node:node /data

# Set environment variables
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000
ENV HOST=0.0.0.0
ENV SQLITE_EXTENSIONS_DIR=/app/extensions

# Use non-root user for security
USER node

# Expose port
EXPOSE 3000

# Volume for persistent data
VOLUME /data

# Health check using node instead of wget/curl
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start server
CMD ["node", "dist/index.js"]


