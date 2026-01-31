# @eidos.space/ext-server

A standalone Hono middleware for rendering Eidos block extensions server-side.

## Installation

```bash
npm install @eidos.space/ext-server
```

## Quick Start (Eidos Ecosystem)

If you're using the Eidos ecosystem, the simplest way to get started:

```typescript
import { Hono } from 'hono';
import { createExtensionMiddleware, createEidosDependencies } from '@eidos.space/ext-server/eidos';

const app = new Hono();

app.use('*', createExtensionMiddleware({
  getExtensionProvider: async (spaceId) => ({
    getById: async (id) => db.extensions.findOne({ id }),
    getBySlug: async (slug) => db.extensions.findOne({ slug }),
  }),
  dependencies: createEidosDependencies(), // One line - batteries included!
}));

export default app;
```

> **Note**: Using `/eidos` entry requires `@eidos.space/sandbox` and `@eidos.space/v3` as peer dependencies.

## Custom Usage (Standalone)

For custom implementations or when not using the Eidos ecosystem:

```typescript
import { Hono } from 'hono';
import { createExtensionMiddleware } from '@eidos.space/ext-server';

const app = new Hono();

app.use('*', createExtensionMiddleware({
  getExtensionProvider: async (spaceId) => ({
    getById: async (id) => db.extensions.findOne({ id }),
    getBySlug: async (slug) => db.extensions.findOne({ slug }),
    getBySlugOrId: async (slugOrId) => db.extensions.findOne({ 
      $or: [{ id: slugOrId }, { slug: slugOrId }] 
    }),
    getThemeMode: async () => db.settings.get('theme'),
  }),
  
  // Provide your own implementations
  dependencies: {
    makeSdkInjectScript: myMakeSdkInjectScript,
    extractFunction: myExtractFunction,
    getAllLibs: myGetAllLibs,
    generateImportMap: myGenerateImportMap,
    uiComponentsDependencies: myUiDeps,
    createSandboxHandler: (getScriptCode) => mySandboxHandler,
  },
}));
```

## Extension URL Pattern

The middleware intercepts requests matching these patterns:

- **Extension**: `http://<extId>.block.<spaceId>.eidos.localhost:<port>/`
- **Sandbox**: `http://sandbox.<spaceId>.eidos.localhost:<port>/`

### Static Files

The middleware automatically serves:
- `/app-wrapper.js` - React app bootstrapper
- `/sw.js` - Service worker for caching
- `/tailwind-raw.js` - Tailwind CSS CDN runtime
- `/app.js` - The compiled extension code

## Configuration

### `ExtServerConfig`

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `getExtensionProvider` | `(spaceId: string) => Promise<ExtensionProvider>` | ✓ | Returns extension data provider |
| `dependencies` | `ExtServerDependencies` | ✓ | Injected functions (use `createEidosDependencies()`) |
| `port` | `number` | | Server port (for logging) |
| `themeMode` | `'light' \| 'dark'` | | Override theme mode |
| `syncEnabled` | `boolean` | | Show sync status in extension context |
| `customThemes` | `Theme[]` | | Additional custom themes |
| `hostnamePattern` | `RegExp` | | Custom extension hostname pattern |

### `ExtensionProvider`

| Method | Required | Description |
|--------|----------|-------------|
| `getById(id)` | ✓ | Get extension by ID |
| `getBySlug(slug)` | | Get extension by slug (fallback) |
| `getBySlugOrId(slugOrId)` | | Get extension by slug or ID (for local libs) |
| `getThemeMode()` | | Get current theme mode from storage |

## IExtension Interface

Your extension objects should match this interface:

```typescript
interface IExtension {
  id: string;
  name?: string;
  slug?: string;
  code?: string;      // Compiled JavaScript
  ts_code?: string;   // Original TypeScript
  bindings?: IBindings;
  meta?: { type?: string; [key: string]: any };
}
```

## Custom Hostname Patterns

```typescript
createExtensionMiddleware({
  hostnamePattern: /^([a-zA-Z0-9-]+)\.ext\.(.+)\.yourdomain\.com$/,
  sandboxHostnamePattern: /^sandbox\.(.+)\.yourdomain\.com$/,
  // ...
});
```

## Architecture

```
Browser Request
    ↓
createExtensionMiddleware
    ↓
getExtensionProvider(spaceId)
    ↓
dependencies.getAllLibs(code)      → Analyze imports
dependencies.generateImportMap()   → Create browser import map
dependencies.extractFunction()     → Extract getServerSideProps
dependencies.makeSdkInjectScript() → Generate SDK <script>
    ↓
Render HTML with import map + SDK
    ↓
Browser loads /app-wrapper.js
    ↓
Import extension code via /app.js
    ↓
Render React component
```

## License

MIT
