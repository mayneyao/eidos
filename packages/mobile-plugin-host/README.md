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
import button to select a `.eidos-plugin`. Review its permissions, install it,
then use the switch in **已安装** to enable it for the current Space. The installed
list works offline. Tap a plugin in either list to read its repository README in
a WebView. Markdown images and links resolve relative to the repository; links
open in the system browser. Previously loaded READMEs remain available offline.
For installed plugins, use the row's **管理** button to review permissions, open
tools, or uninstall. Refresh the market to compare versions and install updates.
Android's file menu
**打开方式 → Markmap** immediately renders that note using the shared host.
Workspace commands, including **Open Journals overview** and **Open today's
journal**, appear in the enabled plugin's details and do not require a file
selection. When configuring table plugins, select a file and a table first.
Chart and Map also integrate with the shared `.eidos` editor's saved views.
Configure Smart Actions outputs in its configuration page and save its API
connection before running an action. Writes require explicit confirmation.

| Published package   | Supported workflow                                         |
| ------------------- | ---------------------------------------------------------- |
| Markmap 0.3.0       | Render a selected Markdown document                        |
| Chart 0.3.0         | Read and aggregate table data; persist chart configuration |
| Map 0.3.0           | Configure location fields and render table records         |
| Journals 0.5.0      | Create/open today's note and browse its overview           |
| Smart Actions 0.3.0 | Configure outputs/connections; run guarded table writes    |

Plugin themes, including Forest and Maple Mono, are disabled on mobile.
Previously enabled themes are ignored; the app uses its built-in light/dark appearance.
The native shell keeps its platform font. External map resources and AI
providers require network access. Smart Actions requires the user's own
provider credentials; installing it does not configure a provider.

## Boundaries

Packages, enablement, settings and credentials are device-local, outside the
Space and Graft history. Installation does not grant Space access. Changed
packages require fresh enablement. Registry archives are SHA-256 checked;
local imports are identified separately. Android uses AndroidKeyStore and iOS
uses Keychain for connection secrets. Guest code receives proxy responses,
never credentials. Native bridges are restricted to the trusted workbench;
guest calls must pass declared-capability and binding checks in the host.

This implements the capabilities used by the listed registry packages, not
full Plugin API conformance. Plugin storage, formatters and workspace filemeta
are unsupported. Document access is read-only. Workspace writes cannot replace
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
`registry.json`. The smoke script checks archive hashes and runs the actual
published modules in Chromium at a phone viewport with a real SQLite Runtime:

```sh
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
