# Eidos Desktop CORS Architecture

## Overview

This document describes the unified CORS (Cross-Origin Resource Sharing) handling in Eidos Desktop.

## Philosophy

**Single Source of Truth**: All CORS headers are set at the Hono server level (`server.ts`).
The Electron `webRequest` API only handles:
- COOP/COEP headers for cross-origin isolation (required for SharedArrayBuffer/WASM)
- Origin header modification for trusted domains

## Architecture

```
Request Flow:
┌─────────────────┐
│  Browser/iframe │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Electron       │────▶│  webRequest     │ (COOP/COEP only, no CORS)
│  Network Layer  │     │  onHeadersReceived
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│              Hono Server                     │
│              (server.ts)                     │
├──────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────────────┐  │
│  │ Proxy       │    │ Global CORS         │  │
│  │ Handler     │    │ Middleware          │  │
│  │ (*.proxy.*) │    │ (skips *.proxy.*)   │  │
│  │ Own CORS    │    │                     │  │
│  └─────────────┘    └──────────┬──────────┘  │
│                                │             │
│                   ┌────────────┴─────────┐   │
│                   ▼                    ▼     │
│         ┌──────────────┐    ┌──────────────┐ │
│         │ Extension    │    │ API Routes   │ │
│         │ Middleware   │    │ (/rpc, /ai)  │ │
│         └──────────────┘    └──────────────┘ │
└──────────────────────────────────────────────┘
```

## Components

### 1. Global CORS Middleware (`server.ts`)

**Location**: `apps/desktop/electron/server.ts`

**Responsibilities**:
- Set `Access-Control-Allow-Origin` for all allowed origins
- Set `Access-Control-Allow-Methods`
- Set `Access-Control-Allow-Headers`
- Set `Access-Control-Allow-Credentials`
- Handle preflight (OPTIONS) requests
- Set COOP/COEP headers for cross-origin isolation

**Special Cases**:
- **Sandbox iframes**: Origin may be `"null"` (opaque origin), allowed if hostname matches `sandbox.*.eidos.localhost`
- **Proxy subdomain**: Skipped entirely, proxy handler manages its own CORS

**Code**:
```typescript
app.use('*', async (c, next) => {
    // Skip proxy subdomain
    if (hostname === 'proxy.eidos.localhost') {
        await next();
        return;
    }

    // Check if origin is allowed
    const allowed = isAllowedOrigin(requestOrigin, hostname);
    
    if (allowed) {
        c.header('Access-Control-Allow-Origin', getAllowOrigin(requestOrigin, hostname));
        // ... other headers
    }

    // Handle preflight
    if (c.req.method === 'OPTIONS' && allowed) {
        return c.body(null, 204);
    }

    // COOP/COEP for SharedArrayBuffer
    c.header('Cross-Origin-Opener-Policy', 'same-origin');
    c.header('Cross-Origin-Embedder-Policy', 'require-corp');

    await next();
});
```

### 2. Extension Middleware (`packages/ext-server/src/middleware.ts`)

**Responsibilities**:
- Serve static JS assets (`eidos-client.js`, `sw.js`, etc.)
- Handle sandbox HTML and script requests

**CORS Handling**:
Static assets are returned directly with `new Response()`, bypassing the global CORS middleware.
Therefore, they must set their own CORS headers:

```typescript
const jsHeaders = new Headers({
    "Content-Type": "text/javascript",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Access-Control-Allow-Origin": "*",
});
```

### 3. Proxy Handler (`packages/sandbox/src/proxy-handler.ts`)

**Responsibilities**:
- Proxy external URLs through `*.proxy.eidos.localhost` subdomains
- Handle CORS for proxied responses

**Subdomain Pattern**:
```
api.openai.com.proxy.eidos.localhost/v1/chat -> https://api.openai.com/v1/chat
```

**Why subdomain pattern**:
- Better compatibility with libraries that only support modifying base URL
- No need to encode URLs as query parameters
- Cleaner URL structure

**Why it handles its own CORS**:
The proxy serves external content that needs different CORS handling than internal Eidos resources.

### 4. Electron webRequest (`cors-manager.ts`)

**Responsibilities**:
- Set COOP/COEP headers for cross-origin isolation (if not already set by server)
- Modify Origin header for trusted domains (security feature)

**NOT Responsibilities** (anymore):
- Set `Access-Control-Allow-*` headers (now handled by Hono server)

## Hostname Patterns

The following hostname patterns are supported:

| Pattern | Example | Space ID | Use Case |
|---------|---------|----------|----------|
| `<space>.eidos.localhost` | `myspace.eidos.localhost` | `myspace` | Main app |
| `sandbox.<space>.eidos.localhost` | `sandbox.myspace.eidos.localhost` | `myspace` | Script sandbox |
| `<ext>.block.<space>.eidos.localhost` | `abc.block.myspace.eidos.localhost` | `myspace` | Extension blocks |
| `<host>.proxy.eidos.localhost` | `api.openai.com.proxy.eidos.localhost` | N/A | External proxy |

## Testing

To verify CORS is working correctly:

1. **Sandbox script execution**: Open extension detail page → Preview tab
   - Should load `eidos-client.js` without CORS errors
   - Should make `/rpc` calls successfully

2. **Extension blocks**: Load a block extension
   - Should load without CORS errors

3. **Proxy**: Use a script that fetches external data
   - Should proxy through `proxy.eidos.localhost` without CORS errors

## Debugging

If you encounter CORS issues:

1. Check the Network tab in DevTools:
   - Look for duplicate `Access-Control-Allow-Origin` headers
   - Check if preflight (OPTIONS) requests return 204

2. Check server logs:
   - Look for `[ExtServer] Intercepting sandbox request`
   - Verify the correct space ID is extracted

3. Common issues:
   - **Duplicate headers**: Electron webRequest and Hono both setting headers
     - Solution: Ensure `cors-manager.ts` doesn't set CORS headers
   - **Missing headers on static assets**: Ext server returning Response directly
     - Solution: Ensure `jsHeaders` includes `Access-Control-Allow-Origin`
   - **Sandbox origin null**: iframe with sandbox attribute sends `"null"` origin
     - Solution: Global middleware handles `"null"` origin for sandbox hostnames
