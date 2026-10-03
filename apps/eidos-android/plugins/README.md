# Android file views

The file menu's **打开方式** sheet lists the default opener and compatible
bundled read-only file views. Choosing one does not change the default editor.

## Marketplace and package installation

Open **当前文件夹操作 → 插件市场**. The native screen lists the same registry
as Lite. **检查安装** downloads a package through an HTTPS host allowlist,
checks its SHA-256 and registry identity, then validates Android compatibility.
**导入插件包** uses the system document picker for a local `.eidos-plugin`.
Local imports do not have registry authenticity verification; their source is
identified separately in the review dialog.

Both flows use bounded gzip/UTF-8 decoding and the shared manifest, duplicate
JSON key and source validators in a separate trusted validation WebView. Code
is parsed as data, not executed during review. A package requiring unsupported
capabilities cannot install. Review lists file read access, network origins
and Worker permission. Installing does not enable a plugin in any Space.

After installation, turn on the current Space's switch. Packages are stored
privately on the device, outside Space/Graft/Sync. Enablement binds the Space
to the exact installed content hash. Updates with different contents require
fresh enablement; invalid downloads or cancelled reviews preserve the current
installation. Disable or uninstall removes its opening candidates and closes
its active renderer. Uninstall clears all Space grants and deletes unreferenced
package copies without deleting user documents. Installed plugins work offline
subject to their declared network needs. Market browsing requires networking.

GPX Viewer can be installed from its local `dist/*.eidos-plugin` without
rebuilding for each plugin update. Being available in a local source checkout
does not make a plugin appear in the public registry; publication is separate.

## GPX Viewer

Bundle the existing GPX Viewer without changing or forking its source. Set
this in Android's ignored `local.properties`:

```properties
eidos.pluginSources=/absolute/path/to/eidos-plugins/eidos-gpx-viewer
```

Alternatively set `EIDOS_ANDROID_PLUGIN_SOURCES`; it takes precedence and uses
the platform path separator for multiple directories. The source checkout must
contain its installed dependencies and generated MapLibre resources. Gradle
uses the shared plugin compiler and packages self-contained code, CSS and a
native registration catalog. Source files are build inputs. Metadata discovery
does not execute plugins. The APK has no dependency on this workstation path.

Import a GPX file into the Space, then choose **更多 → 打开方式 → GPX 地图**.
The chooser shows the permitted network origin. The plugin reads its bound
file (up to 16 MiB); **刷新** reads the current bytes again. Its GPX parser,
route selector, timeline, playback and charts are reused unchanged. Bundled
Blob workers decode MapLibre data. OpenFreeMap supplies map tiles, glyphs and
sprites, and receives requested viewport coordinates and network metadata.
GPX bytes stay local. Parsing and timeline interaction remain available when
map requests fail; there are no offline map-region downloads.

## Host profile and boundaries

The host accepts Plugin API 3.0.0 read-only `file/open` views with either
`capabilities: ["document"]` or no bound-data declarations.
`browser.workers` permits Blob workers; `browser.networkOrigins` permits
exact declared HTTPS origins. Workspace grants, writes, Eidos capabilities,
actions, pages, settings, connections and storage fail build validation.

Document views receive a committed UTF-8 snapshot of at most 2 MiB. Reopen to
refresh it. Recovery drafts are not exposed. `document.read/observe` expose
the snapshot; edit/save/undo/redo reject with `PERMISSION_DENIED`.

Ordinary file views receive `fs.readBinary` (16 MiB) and `fs.readText`
(2 MiB), bound to the selected filename relative to its directory, as in Lite.
Other paths and all writes are denied. Unsupported filesystem methods are
omitted. Each read uses one host-owned session URL: guest paths never select
a native file. The interceptor reads through SpaceRepository's serialized
boundary, enforces bounded reads and rejects responses after renderer closure.
No filesystem handles or editor JavaScript bridge are exposed. Mount uses
`binding`, `capabilities`, `signal`, subscriptions and `ui.notify`.

Native request filtering and CSP restrict resources to that session endpoint
and declared origins. External navigation, file/content access, remote scripts,
frames and persistent DOM storage are disabled. Workers require a declaration.
Installed self-contained ESM modules execute only after validation, installation
review and Space enablement. Their renderer exposes the same bound-file access,
and hash verification runs before each opening. Eidos UI HostServices and the JNI Runtime
remain owned by the existing editor, not by plugins.

This experimental profile is not full Plugin API conformance. It does not
support automatic Space discovery, saved defaults, writable contributions,
actions, pages, table views or themes. Text previews remain available without
a GPX checkout configured.

## Checks

```sh
EIDOS_ANDROID_PLUGIN_SOURCES=/path/to/eidos-gpx-viewer node apps/eidos-android/scripts/build-plugins.mjs
node --test apps/eidos-android/scripts/build-plugins.test.mjs
EIDOS_ANDROID_PLUGIN_SOURCES=/path/to/eidos-gpx-viewer node apps/eidos-android/scripts/test-gpx-browser.mjs
EIDOS_ANDROID_PLUGIN_SOURCES=/path/to/eidos-gpx-viewer node apps/eidos-android/scripts/test-plugin-package.mjs
EIDOS_ANDROID_PLUGIN_SOURCES=/path/to/eidos-gpx-viewer node apps/eidos-android/scripts/test-gpx-browser.mjs --installed
cd apps/eidos-android
./gradlew :app:testDebugUnitTest :app:lintDebug -x buildNative -x buildWebEditor
```

The browser check uses the GPX checkout's Playwright and Chrome. It exercises
the actual GPX bundle, Android host scripts and native CSP template at a phone
viewport: real vector tiles, workers, playback, seeking, charts, refresh,
failed refresh preserving content, denied network and offline parsing.
Screenshots are under `app/build/reports/gpx-browser`. These checks do not
install APKs, run an emulator or rebuild JNI. Android WebView/GPU and native
opening/back-navigation still require separate device verification.

`PluginMarketTest` is an opt-in Android instrumentation check for import,
validation, review without installation, disabled-by-default installation,
Space isolation, update revocation, invalid-update preservation and uninstall.
Compile it without using a device with `:app:compileDebugAndroidTestKotlin`.
