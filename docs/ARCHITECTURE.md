# Eidos Package Architecture

## Package Overview

```
packages/
├── proxy/           # HTTP Proxy (subdomain-based)
├── client/          # RPC Client + Binary Data Utils
├── ext-server/      # Extension Runtime (blocks + sandbox)
├── core/            # Core DataSpace API
├── v3/              # Extension Compilation
├── lib/             # Shared Utilities
├── worker/          # Web Workers
├── ai/              # AI Integration
├── sync/            # Graft Sync
├── react/           # React Hooks for Extensions
├── locales/         # i18n
├── shared/          # Shared Types
├── code-editor/     # Monaco Integration
└── space-manager/   # Space Management
```

## Application Dependencies

### apps/desktop (Electron App)

```
desktop
├── @eidos.space/proxy          # HTTP proxy middleware (CORS handling)
├── @eidos.space/client         # Binary data utilities for RPC
├── @eidos.space/ext-server     # Extension/sandbox runtime
├── @eidos.space/space-manager  # Desktop space management
└── @eidos.space/better-sqlite3 # Native SQLite
```

**Key Integration Points:**
- `server.ts`: Uses `createProxyMiddleware` + `createExtensionMiddleware`
- RPC endpoint: Uses binary-data utils from client
- Extension hosting: Full ext-server with sandbox support

### apps/headless (Headless Server)

```
headless
├── @eidos.space/client     # (devDep, for static assets)
├── @eidos.space/ext-server # Extension runtime
├── @eidos.space/core       # DataSpace API
└── @eidos.space/v3         # Extension compilation
```

**Key Differences from Desktop:**
- No `@eidos.space/proxy` (no CORS proxy needed)
- Uses `createEidosDependencies()` instead of `createDesktopConfig()`
- Simpler CORS handling (just `hono/cors`)

## Package Details

### @eidos.space/proxy

**Purpose:** HTTP proxy for cross-origin requests

**Pattern:** `api.example.com.proxy.eidos.localhost/path` → `https://api.example.com/path`

**Exports:**
- `createProxyMiddleware()` - Hono middleware
- `ProxyHandler` - Class for advanced use

**Used by:**
- `apps/desktop` - For extension sandbox fetch proxying

**Not used by:**
- `apps/headless` - Headless doesn't need CORS proxy

---

### @eidos.space/client

**Purpose:** RPC client for external connections + binary data utilities

**Exports:**
- `createEidosClient()` - RPC client for headless connections
- `createSpaceProxy()` - Low-level space proxy
- Binary data utilities:
  - `containsBinaryData()`
  - `processBinaryDataForResponse()`
  - `restoreBinaryData()`
  - `parseMultipartFormData()`

**Used by:**
- `apps/desktop` - Binary data utilities for RPC endpoint
- External SDK users - RPC client

**Note:** Binary data utils are server-side utilities, not client-side.

---

### @eidos.space/ext-server

**Purpose:** Complete extension runtime environment

**Components:**
1. **Extension Middleware** - Block extension hosting (`*.block.*.eidos.localhost`)
2. **Script Sandbox** - Script execution environment (`sandbox.*.eidos.localhost`)
3. **SDK Injection** - `makeSdkInjectScript()` for both

**Exports:**
- `createExtensionMiddleware()` - Main middleware
- `ScriptSandboxHandler` - Script sandbox
- `makeSdkInjectScript()` - SDK injection
- `createEidosDependencies()` - Headless config
- `createDesktopConfig()` - Desktop config

**Used by:**
- `apps/desktop` - Full functionality with desktop config
- `apps/headless` - Extension hosting with simpler config

---

### @eidos.space/core

**Purpose:** Core DataSpace API and SQLite operations

**Exports:**
- `DataSpace` - Main database API
- Meta-tables (tables, views, extensions, etc.)
- Query builders

**Used by:**
- Everything - Core dependency

---

### @eidos.space/v3

**Purpose:** Extension compilation and code transformation

**Exports:**
- `compileCode()` - TypeScript compilation
- `extractFunction()` - Server-side props extraction
- `getAllLibs()` - Dependency analysis
- `generateImportMap()` - Import map generation

**Used by:**
- `apps/web-app` - Extension editor compilation
- `@eidos.space/ext-server` - Runtime compilation

## Dependency Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        Applications                          │
├──────────────────────────┬──────────────────────────────────┤
│     apps/desktop         │        apps/headless             │
│  (Electron, Full Stack)  │    (Node.js, Server Only)        │
├──────────────────────────┼──────────────────────────────────┤
│ • @eidos.space/proxy     │                                  │
│ • @eidos.space/client    │  • @eidos.space/client (assets)  │
│ • @eidos.space/ext-server│  • @eidos.space/ext-server       │
│ • @eidos.space/space-    │  • @eidos.space/core             │
│   manager                │  • @eidos.space/v3               │
│ • @eidos.space/better-   │                                  │
│   sqlite3                │                                  │
└──────────────────────────┴──────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │   proxy    │  │   client   │  │ ext-server │
    │            │  │            │  │            │
    │ HTTP Proxy │  │ RPC Client │  │ Extension  │
    │            │  │ Binary Utils│  │ Runtime    │
    └────────────┘  └────────────┘  └────────────┘
                                           │
                                    ┌──────┴──────┐
                                    ▼             ▼
                              ┌──────────┐  ┌──────────┐
                              │   core   │  │    v3    │
                              │ DataSpace│  │ Compiler │
                              └──────────┘  └──────────┘
```

## Key Design Decisions

### 1. Proxy is Separate

Proxy is a standalone package because:
- It's a generic HTTP proxy utility
- Headless doesn't need it (no CORS issues in server-to-server)
- Could be used independently

### 2. Client Contains Binary Utils

Binary data utilities are in client because:
- They're RPC-related utilities
- Server needs them for multipart form handling
- Client already had similar code (extracted from old sandbox)

### 3. Ext-Server is Self-Contained

Ext-server includes both blocks and sandbox:
- They share the same SDK injection mechanism
- They share the same static assets
- They share the same domain pattern handling

### 4. No Runtime Dependencies Between Proxy/Client/Ext-Server

These three are independent:
- `proxy` - Pure HTTP proxy
- `client` - RPC client + utils
- `ext-server` - Extension runtime

This allows flexible composition in different apps.

## Migration History

### Phase 1: Split Proxy
- Extracted `proxy` from `sandbox`

### Phase 2: Move Sandbox to Ext-Server
- Moved `ScriptSandboxHandler` to `ext-server`
- Moved `makeSdkInjectScript` to `ext-server`

### Phase 3: Remove Sandbox Package
- Binary utils moved to `client`
- `sandbox` package deleted
- Desktop uses `client` for binary utils

## Future Considerations

1. **Rename `client` binary utils** - They're server-side utilities, misleading name
2. **Consider merging `proxy` into `ext-server`** - If proxy is only used for extensions
3. **Extract shared types** - Some types duplicated between packages
