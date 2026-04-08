## Architecture Overview

The desktop client is built using **Electron**, providing a native application experience while reusing the web-app codebase.

### Relationship with Web App

- The desktop app **depends on** `apps/web-app` as its foundation
- The web-app code is designed to be **compatible** with both browser and Electron environments
- Desktop-specific features are implemented through **selective overrides**

### Service Mode Architecture

Unlike traditional Electron apps that load files directly via `file://` protocol, Eidos uses a **local HTTP server** architecture:

#### How It Works

1. **HTTP Server in Main Process**
   - When Electron starts, the main process launches an HTTP server (default port: `13127`)
   - Server is implemented using [Hono](https://hono.dev/) framework
   - See `electron/core/server/server.ts` for implementation

2. **Renderer Loads via HTTP**
   - The renderer process loads content via `http://localhost:13127` instead of `file://`
   - All resources (HTML, CSS, JS, images) are served through HTTP
   - API calls use standard HTTP requests to the same server

3. **Subdomain-based Routing**
   - Each space has its own subdomain: `http://<spaceId>.eidos.localhost:13127`
   - Extensions use nested subdomains: `http://<extId>.block.<spaceId>.eidos.localhost:13127`
   - This provides isolation and proper CORS handling

#### Key Benefits

- ✅ **Standard Web APIs**: Use `fetch()`, `XMLHttpRequest` without special handling
- ✅ **CORS Support**: Proper cross-origin handling for extensions
- ✅ **File Serving**: Unified file serving for both local and mounted files
- ✅ **Hot Reload**: Easier development with standard web dev tools

#### API Endpoints

The local server provides several endpoints:

| Endpoint       | Purpose                                                      |
| -------------- | ------------------------------------------------------------ |
| `/rpc`         | RPC calls to SQLite and core functions                       |
| `/files/*`     | Serve files from space's file storage. eq `~/.eidos/files/*` |
| `/~/*`         | Serve files from space's root directory                      |
| `/@/<mount>/*` | Serve files from mounted directories                         |
| `/api/chat`    | AI chat API                                                  |

#### Development vs Production

**Development Mode** (`npm run dev`):

```
Vite Dev Server: http://localhost:5173
Local API Server: http://localhost:13127
Renderer loads from: http://<spaceId>.eidos.localhost:5173
API proxied to: http://localhost:13127
```

**Production Mode** (packaged app):

```
Local Server: http://localhost:13127
Renderer loads from: http://<spaceId>.eidos.localhost:13127
All resources served locally
```

### Code Organization

The project follows a **shared structure** pattern:

```
apps/
├── web-app/           # Base implementation (browser-compatible)
└── desktop/
    └── renderer/      # Desktop-specific overrides (same structure as web-app)
```

#### When to Override

Create desktop-specific implementations in `apps/desktop/renderer` when:

- **Behavior differs significantly** between web and desktop
- **Native APIs** are required (file system, system dialogs, etc.)
- **Performance optimizations** specific to Electron are needed

#### Example: Storage Settings

The `/settings/storage` page behaves completely differently:

- **Web**: Uses browser storage APIs, quota management
- **Desktop**: Direct file system access, custom storage location

In this case:

- ✅ Implement desktop version in `apps/desktop/renderer/settings/storage`
- ❌ Don't add compatibility code to `apps/web-app`

This keeps the web-app clean and the desktop app maintainable.

## Native Package Building

When working with native Node.js modules (packages with `.node` binary files), special configuration is required:

### Current Native Dependencies

The following native packages are currently used:

- `better-sqlite3` - SQLite database
- `@vscode/ripgrep` - Fast text search
- `oxc-parser` - JavaScript/TypeScript parser
- `oxc-transform` - JavaScript/TypeScript transformer

### Configuration Requirements

When adding a new native dependency, you **must** update both files:

#### 1. `electron/electron-builder.json`

Add the package to the `files` array to include it in the build:

```json
{
  "npmRebuild": true,
  "files": [
    "**/node_modules/your-native-package/**/*",
    "**/node_modules/@your-scope/native-package/**/*"
  ]
}
```

> **Important**: `npmRebuild: true` ensures native modules are rebuilt for the target platform during packaging.

#### 2. `vite.config.ts`

Add the package to the `externalNodeModules` array to prevent Vite from bundling it:

```typescript
const externalNodeModules = [
  "better-sqlite3",
  "oxc-parser",
  "oxc-transform",
  "@vscode/ripgrep",
  "your-native-package", // Add here
]
```

This array is used in the `rollupOptions.external` configuration for both `main` and `preload` builds.

### Why This Is Necessary

- **Native modules contain platform-specific binaries** (`.node` files) that cannot be bundled by Vite
- **electron-builder needs to rebuild** these modules for the target platform (Windows, macOS, Linux)
- **Bundling native modules will cause runtime errors** because the binary paths will be incorrect
- **Missing configuration will result in** "Cannot find module" errors or crashes when the app tries to load the native module

### Testing Native Modules

After adding a native dependency:

1. Run `npm run build` to build the Electron app
2. Test the packaged app on each target platform (Windows, macOS, Linux)
3. Verify the native module loads correctly without errors
