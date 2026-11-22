# Mobile plugin host

Android and iOS consume this internal source package through their Web editor
builds. Native Compose and SwiftUI screens manage installation, permissions,
activation and removal. The trusted WebView workbench handles plugin configuration
and launching. Each guest runs in an opaque-origin sandboxed iframe using the
canonical Plugin API bootstrap, CSP, manifest parser and request validator.
Eidos data operations use the canonical Runtime. Table action writes reuse
the desktop host's captured-target, revision and read-token checks.

## Using plugins

Android: **当前文件夹操作 → 插件**. iOS: **Space 操作 → 插件**.
Use **插件市场 → 浏览** (iOS: **浏览插件市场**) to load the registry, or the toolbar's
import button to select a `.eidos-plugin`. Review its permissions and install it;
installation enables it in the Space where you started. The installed
list works offline. Tap a plugin in either list to read its repository README in
a WebView. Markdown images and links resolve relative to the repository; links
open in the system browser. Previously loaded READMEs remain available offline.
For installed plugins, use the row's **管理** button to review permissions, open
tools, or uninstall. Refresh the market to compare versions and install updates.
Discover and search share the verified catalog. The app bundles verification
results for published archives, keyed by plugin ID, version, SHA-256, and release
URL. Matching catalog entries can appear after the registry request. Changed or
new releases go through the current installer's package checks before appearing.
If the validator changes, the Web build automatically discards the old cached
results. If a download fails during verification, retry from Discover. Both
install buttons recheck the selected archive before permission review.

Dashboard 0.2.0 is hidden in Discover because its editor requires the desktop
resource embedding API. The local import path continues to check package and
host declarations independently of marketplace visibility.
On either app, **打开方式 → Markmap** renders the selected note.
On either mobile app, **打开方式 → Canvas** opens an existing `.canvas` file.
Use **保存** to write changes before closing the editor.
Workspace commands, including **Open Journals overview** and **Open today's
journal**, appear in the enabled plugin's details and do not require a file
selection. When configuring table plugins, select a file and a table first.
Chart and Map also integrate with the shared `.eidos` editor's saved views.
Configure Smart Actions outputs in its configuration page and save its API
connection before running an action. Writes require explicit confirmation.

| Published package   | Supported workflow                                         |
| ------------------- | ---------------------------------------------------------- |
| Markmap 0.4.0       | Render a selected Markdown document                        |
| Chart 0.3.2         | Read and aggregate table data; persist chart configuration |
| Map 0.3.0           | Configure location fields and render table records         |
| Journals 0.5.3      | Create/open today's note and browse its overview           |
| Smart Actions 0.4.0 | Configure outputs/connections; run guarded table writes    |
| GPX Viewer 0.2.0    | Open GPX files using the plugin's map view                 |
| Canvas 0.5.7        | Open, edit and save existing JSON Canvas files             |

The installer accepts format 2 packages and format 3 packages with declared
localization resources. Format 3 resources use the canonical package validation
rules, and plugin views and actions receive the app's language and message data.
Support is checked against declared capabilities, including for packages requiring
Plugin API 3.7.0. The installer accepts validated static file template
declarations for plugins shared with Lite. Creating from a template is
available in Lite. Background services, plugin storage, formatters,
unrestricted browser network access and workspace filemeta remain unsupported.

Plugin themes, including Forest and Maple Mono, are disabled on mobile.
Previously enabled themes are ignored; the app uses its built-in light/dark appearance.
The native shell keeps its platform font. External map resources and AI
providers require network access. Smart Actions requires the user's own
provider credentials; installing it does not configure a provider.

## Boundaries

Packages, enablement, settings and credentials are device-local, outside the
Space and Graft history. Confirming installation grants access only to the
originating Space, even if the selected Space changes during installation.
Changed packages require fresh enablement in other Spaces. Registry archives are SHA-256 checked;
local imports are identified separately. Android uses AndroidKeyStore and iOS
uses Keychain for connection secrets. Guest code receives proxy responses,
never credentials. Native bridges are restricted to the trusted workbench;
guest calls must pass declared-capability and binding checks in the host.

This implements the capabilities used by the listed registry packages, not
full Plugin API conformance. Plugin storage, formatters and workspace filemeta
are unsupported. Writable document file Views save the versioned working copy
for their bound UTF-8 file, up to 2 MiB. Direct writes to that file use the
document API. Workspace writes require workspace write permission and cannot replace
`.eidos` files; structured writes use the Runtime. Browser network access is
limited by each plugin's declared origins and CSP. API connection redirects
are rejected. Native settings/credentials are not synchronized between devices.

## Verification

Build both Web entries and typecheck them:

```sh
pnpm --filter @eidos.space/android-editor build:web
pnpm --filter @eidos.space/ios-editor build:web
pnpm --filter @eidos.space/android-editor typecheck
pnpm --filter @eidos.space/ios-editor typecheck
```

Download the registry's published archives into a temporary directory alongside
`registry.json`. To refresh the bundled verification results, run the generator
with that directory and exercise the native installation checks on both apps.
The smoke script separately checks archive hashes and runs the published modules
in Chromium with a real SQLite Runtime:

```sh
node packages/mobile-plugin-host/scripts/generate-market-index.mjs /path/to/fixtures
node scripts/run-electron-node.mjs packages/mobile-plugin-host/scripts/smoke.mjs /path/to/fixtures
```

The Smart Actions test substitutes a deterministic AI response, then verifies
the published extension's real guarded writes. It does not contact a paid API.
Android's `MobilePluginServiceTest` covers native filesystem boundaries and,
with the `pluginFixtures` instrumentation argument, validates/installs the same
archives. That fixture directory must be readable by the app process.
iOS's `testPluginWorkbenchOpensOffline` checks the actual WKWebView entry.

## Mobile navigation pages

Android shows enabled Page views in its bottom navigation when the manifest
explicitly declares a navigation placement:

```json
{ "location": "navigation", "view": "overview" }
```

The target must be a `kind: "page"` view. Its title labels the destination.
Command-palette actions alone do not create navigation entries. Navigation
opens the page directly without the plugin workbench or a file picker.
Enablement is scoped to the current Space; disabling or uninstalling removes
the destination. Additional pages beyond the bottom bar capacity appear in
the More menu. Switching to a built-in tab retains the last plugin page;
switching Space, changing its package, or revoking its permissions disposes it.
