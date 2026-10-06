# Eidos for Android

An experimental native Android host for local Markdown and Eidos File data.
The application shell uses Kotlin and Jetpack Compose. Markdown and `.eidos`
files open in a bundled WebView editor by default. There is no local HTTP server.
It builds independently of the Web and Electron applications.

The interface supports English and Chinese. Open the file browser's **Folder actions → Language** menu to choose **Follow system**, **中文**, or **English**. The default follows the system language, using Chinese for `zh` and English for other languages. The choice is saved for the app and applies to the native interface and bundled editor without reopening the Space.

To remove a local Space, open its name menu and choose **删除此 Space 的本地数据**.
Confirm the scope, then complete Android's system screen-lock verification.
Cancellation or missing screen-lock credentials leaves the Space intact. Deletion
removes local files, history, drafts and sync associations; paired devices and
copies on other devices remain. Deleting the last Space creates a new empty one.

## Native dependency status

The Git dependency pins Graft revision
`5c99ad07ee1af7b66432c94c6e919c7faa5cacd5`. The standard native build applies
[the mobile runtime patch](patches/graft-android-runtime.patch) to an isolated
copy: Android-compatible DNS resolution and cached checks of unchanged SQLite
files. `scripts/prepare-mobile-native.mjs` verifies the revision and patch,
copies the Rust workspace, and checks that dependency versions and checksums
remain locked. Android and iOS use Rust 1.99.0 for this build. Generated sources
live under each app's ignored `build/native-workspace`; Cargo's shared Git cache
and the developer's Graft checkout are never edited.

## Device Sync progress

Device Sync first reads version metadata and computes the missing snapshot data.
Peer downloads use Graft's `fetch_for_checkout` operation to prepare the repository
graph and SQLite log metadata before downloading external file payloads or SQLite
segments. Android displays “获取清单” until Graft declares the combined total,
“下载数据” during transfer, and “写入文件” only after the target data is cached and
verified. The host does not parse Graft metadata or calculate the transfer budget.
The Android TLS relay bounds upstream concurrency and waits for a free slot
instead of disconnecting requests during a connection burst; cancellation closes
both active and queued sockets.
Once that plan is available, download progress uses a fixed compressed-byte total
across all databases, excluding cached frames and counting shared frames once.
Metadata and snapshot downloads share one operation counter. A running sum of
individual response lengths is never shown as an overall percentage. After transfer, the snapshot is written and the Space is registered. Sync does
not scan database contents or run full Eidos File validation.

## Shared embedded editors

Markdown opens directly in the shared WYSIWYG editor, without a separate mode or
source-switching header. A bottom toolbar provides touch controls for formatting,
headings, lists, quotes, undo and redo. Edits save automatically, including before
leaving the editor. Block dragging and desktop
marquee selection are disabled; Android text selection remains available.
Changes save automatically to local files with recovery drafts and conflict
checks. The `.eidos` editor reuses the shared React table and record components
for searching, adding, editing, and deleting records. Its bridge calls the
canonical native Runtime; SQLite files stay on the device. All editor assets
ship inside the APK, so editing works offline and while signed out.

The Activity retains one loaded editor WebView between files. Each file gets a
new bridge session and image URL namespace; requests from retired sessions are
rejected. The idle WebView is released under memory pressure. Markdown batches
continuous input in a 300 ms window and flushes pending changes before leaving
or when the Activity goes into the background. Local writes retain recovery
drafts and digest checks. Returning to files reuses the existing list while local
file metadata refreshes without locking navigation.

Markdown and `.eidos` files use the shared editor for every entry point, including
table favorites, search results, new records, and share forms. Files, account,
Sync, and Publish remain native. Share forms retain their unfinished values and
attachment destination in the local share inbox until submitted.

The view selector reads saved views, including their query and layout. **新建视图**
adds a Grid, Gallery, Kanban, Calendar, Form or Feed view to the local file using
the shared Runtime and each view plugin's default configuration. Creation is
disabled when required fields are absent, such as a Select field for Kanban.
Existing saved query/layout settings are retained. Records open as full pages
on the phone. Calendar uses a compact month/week date selector and a list of records
for the selected day. Choose the date field beside the period title, add a record
from the day's heading, or use a record's **…** button for its bottom-sheet actions.
Markdown's **+ → 图片 / 文件** and `.eidos` attachment fields use
the Android document picker. Selected files are copied into an `assets` folder
beside the document and referenced with relative URLs, so they remain available
offline. Imports support up to 100 files, 64 MB per file and 128 MB per batch.
Relative Markdown links open local Markdown and `.eidos` files in the shared
editor. Back returns to the source document.
View renaming/deletion is not exposed in this shell. Third-party pages and actions
are available from the Space's plugin workbench.
Local raster images are supported; remote images and network requests are blocked.

The Android Gradle build runs `pnpm --filter @eidos.space/android-editor build:web`
and packages its output as assets. Run `pnpm install` from the repository root
before building. `EmbeddedEditorTest` verifies local Markdown saves, canonical
record writes, editor-shell reuse, coalesced Markdown saves, immediate-exit saves,
session isolation, share draft recovery, and navigation from local links and favorites.

In `.eidos` files, native Back dismisses the active sheet before returning from
a record to its view. Record field editors use bottom sheets. Gallery and Kanban
cards expose a visible action button; Kanban records move between groups through
this menu so touch scrolling does not start a drag. View settings provide filters,
sorts, renaming and deletion. The form builder provides visible question actions
and move-up/down controls for touch input.

## Plugins

The native plugin page has **发现** and **已安装** tabs. Discovery supports
name/description search and category filters. Tap a plugin to read its README in
a WebView. The installed row's **管理** button opens permissions, tools, and
uninstall actions; **更多 → 导入插件包** imports a local package.
The switch enables a plugin only in the current Space.

In the file browser, **新建** sits beside **搜索** in the top bar.
**当前文件夹操作 → 排序** offers name, modification time, and file type in either
direction, with folders always first and natural numeric name ordering.
The selected order is remembered across launches and Spaces.

Open **当前文件夹操作 → 插件** to install published packages or import a
`.eidos-plugin`, then enable it for the current Space. Installation, permission
review, activation and removal use native Compose controls. The shared mobile
workbench runs document views, table views, pages, workspace and table
actions, settings, and native connection credentials. Plugin themes are disabled
on mobile; previously enabled themes are ignored. Enabled Chart
and Map views also appear in the `.eidos` editor. Packages and credentials
remain outside the synchronized Space. See the
[mobile plugin host](../../packages/mobile-plugin-host/README.md) for supported
plugins, permissions, and verification commands.

### Bundled file previews

The file menu's **打开方式** sheet offers the default opener and bundled
read-only file views. The text preview uses a committed UTF-8 snapshot (up to
2 MiB). A development build can also bundle the existing GPX Viewer directly
from its source checkout: set `eidos.pluginSources` in the ignored
`local.properties`, or `EIDOS_ANDROID_PLUGIN_SOURCES` in the environment.
GPX Viewer reads only the selected file (up to 16 MiB), supports refresh,
MapLibre workers, tracks, playback and charts, and loads map resources only
from its declared OpenFreeMap origin. Network access is shown in the chooser.
Plugins run in separate WebViews without the editor's native bridge. Opening
a plugin does not change the default editor. Open **当前文件夹操作 → 插件**
to browse the shared registry or import a local `.eidos-plugin` package. Review
its read/network/worker permissions, install it on the device, then enable it
separately for the current Space. Incompatible packages are rejected before
installation. See
[Android file views](plugins/README.md) for the supported manifest profile,
resource boundaries and local checks.

## Mobile Sync interface

The Sync tab currently focuses on LAN device sync. Scan the desktop pairing
QR code (or paste its pairing code), approve the phone on the desktop, then
choose a Space to download. With no paired computer, Sync shows connection
onboarding. Otherwise, select a computer at the top to see only its Spaces.
Downloaded Spaces show their last confirmed transfer time and a sync action;
other offered Spaces have a download action. Switching computers replaces this
list. Offline computers retain their downloaded copies in the list. Open files
and local versions from each Space's menu; device management is secondary.
Keep both apps open on the same network while transferring.

After submitting the code, **等待电脑授权** identifies the computer. Accept the
native pairing dialog in Eidos Lite on that computer. If it is in the background,
click its system notification or open **Settings → Devices**. **取消配对** stops
the wait and dismisses the pending desktop request when reachable. Rejection and
expiry are reported separately; generate a new code to try again.

After a restart or address change, sync checks the saved Space endpoint and the
computer's latest saved endpoint before Bonjour discovery. Every candidate must
pass the paired TLS identity. Stop interrupts address probes and discovery as
well as the transfer. Local files and the last successful sync time remain intact.

Initial downloads use an isolated directory and enter the Space selector only
after transfer and local snapshot application succeed. Retry resumes
the same directory. Existing local Spaces are never used as download targets.

Each phone uploads its saved history to its own incoming Remote. The desktop
automatically merges compatible changes and publishes the validated result.
When changes genuinely conflict, the phone keeps its current files and asks
you to open **Sync** on the desktop. Resolve the conflict there, then tap
**立即同步** on the phone. Phone edits made while waiting are saved and sent on
the next attempt. A conflict, stopped operation or failed transfer never records
a successful sync time. Keep the phone in the foreground while transferring.

The shared delivery checklist and verification commands are in
[Mobile LAN v1](../eidos-ios/ALIGNMENT.md).

Account login, cloud connection/download, custom remote connection and Publish
entry points are hidden from the mobile UI. Mobile LAN v1 does not schedule
background LAN transfers or provide phone-to-phone sync or an Internet relay.

## Files and editing

The shared data editor switches tables with a dropdown beside the `.eidos`
filename in the native header. **字段** opens a bottom sheet: field visibility
and drag ordering belong to the current View; tapping a field opens its shared
property editor in the same sheet. Back preserves the field list and search.
Field names, types, options, numeric display, formulas and lookups use the shared
Runtime mutation and validation paths. Property changes save immediately;
deletion requires confirmation. Creating a field uses the same sheet.

The home footer distinguishes local-only data, pending synchronization, an
interrupted or failed attempt, merge work, and the last completed sync. Completion
is tied to the remote URL, a matching local commit and a clean worktree; it is not
a claim that an offline device knows the remote's latest state.

- Browse an app-managed local Space, create folders, and import/export files
  through Android's document picker. Existing files are never overwritten by
  import.
- Use **+** to add a note, `.eidos` file, folder, imported file or imported folder
  to the current directory. Export is available in file/folder menus; the top
  folder menu exports the current directory. To add a table record, open the
  table first, including from Favorites.
- Open ordinary files directly from the file list. Supported raster images use
  a native preview; other formats offer Android's app chooser. Closing the
  preview keeps the current folder. External apps receive a read-only cache
  snapshot rather than a mutable Space file. The same 64 MiB opening limit,
  2048-pixel image downsampling and cache cleanup rules as record attachments
  apply; symbolic links are rejected.
- Use **+ → 导入文件夹** to import an entire system directory
  into the current folder, or the current folder menu to export to a new child of a
  selected system directory. Relative paths, empty folders and attachment bytes
  are preserved. Import stages the complete tree before publishing it locally;
  name collisions create a numbered sibling. Export closes the Runtime query
  session and holds the Space operation lock while copying. A failed export
  removes only its newly created child; cleanup failures ask you to inspect that
  incomplete copy. If the destination provider renames a nested file or folder,
  export fails and cleans up instead of silently breaking relative links.
  Dot-prefixed entries, including Graft history, are excluded;
  this transfers current visible files, not Sync configuration or app drafts.
  Transfers support at most 100,000 entries and 64 directory levels. Imports
  check free local space while streaming, retaining a 1 MiB reserve, and discard
  an incomplete staged tree on failure.
  Markdown saves and single-file imports use the same reserve check. A rejected
  Markdown save retains the original file and its recovery draft so you can retry
  after freeing space. These checks cannot reserve disk capacity against other
  applications; atomic replacement remains the protection for a write that fails
  after its preflight succeeds.
- Create and switch local Spaces from the home header. The selected Space is
  remembered for the next launch. Files, drafts, favorites, and Sync credentials
  are isolated; switching preserves an unfinished Markdown draft in its source
  Space. New share intents use the selected Space.
- Download a remote Space from the home header's Space menu. Enter a new local
  name, the remote HTTPS URL, and its access token. Graft materializes files and
  attachments into a separate empty directory; the Space is added and selected
  only after download succeeds. Failed attempts preserve the current Space and
  can be retried from the form. The connection is retained for subsequent Sync.
  Interrupted downloads leave a durable recovery entry in the Space menu, with
  credentials kept in the encrypted profile store. An incomplete copy can be
  downloaded again or removed; a fully downloaded copy can finish registration
  offline. Restarting replaces only that unregistered copy. Partial-transfer
  resumption and background downloading are not yet supported.
- Favorite files and folders from their row menu, or favorite the current table
  from its toolbar. Favorites persist across restarts and appear on the home
  screen. Opening a favorite table uses the shared editor.
  Missing targets remain removable; a missing table never redirects a new
  record to another table. Favorites are local preferences, not synchronized
  Space content.
- Create, read, edit, and search UTF-8 Markdown with the shared rich-text editor.
  Edits save automatically with recoverable drafts, atomic replacement, and content
  digest checks. Back and backgrounding flush pending edits. Text files are limited
  to 2 MiB. Local links return to their source with Back; HTTP(S) links open externally.
- Create `.eidos` files and manage tables, views, fields, records, relations, and
  attachments through the shared editor and canonical Runtime. Record changes save
  immediately. Text, number, integer, and URL values edit in place; date, option,
  relation, and attachment values open their field editor directly.
  Share forms keep their field edits and attachment destination in the pending
  inbox until **保存记录** commits the record. Reopening the same destination restores
  its draft and original revision. Failed or uncertain submissions retain staged
  content for recovery.
- Choose a destination folder before saving shared text, links, images, or files.
  A title supplied by the sharing application is retained above the original
  text or URL. If the text already starts with that title, it is not duplicated.
  The native picker starts in `收件箱/` and remembers the last successful folder
  separately for each Space. Text and links become Markdown; single or multiple
  files are copied from Android content URIs. Duplicate filenames receive numbered suffixes; existing files
  are preserved. A failed file does not remove successful imports, and any
  accompanying text is saved as a separate Markdown note. Pending shares survive
  app restarts through private, per-Space copies; successive shares are queued.
  Receiving a share copies its bytes before opening the destination picker, without
  writing into the Space. A failed copy publishes no partial pending item.
  Limits are 100 files, 64 MiB per file, 128 MiB per share, 2 MiB of text and
  20 pending shares per Space. Save interruptions require reviewing the previous
  destination before retrying because some content may already have committed.
  The Space menu reopens pending shares after checking files. For table destinations,
  select an `.eidos` file and table, a favorite table, or the last used table to
  open a prefilled shared record page. Review the fields and press **保存记录** to commit
  through the Runtime. The complete text is placed in the writable text/URL
  label field, or the first writable text field when the label is unsuitable.
  File shares can also target a writable File field; select the destination
  field in the record form before saving. Files are copied to an isolated
  directory under `assets/` beside the `.eidos` file, with relative resource URIs
  and metadata allocated by the canonical Runtime. Imports support up to 100
  files, 64 MiB per file and 128 MiB total. Failed imports clean up their new
  copies when the original database revision is unchanged. An uncertain commit
  retains the bytes and asks you to inspect the table before retrying.
  Shared attachment fields show file details and can remove references without
  deleting the underlying bytes. Pending shares and their form drafts recover
  from private storage after the application reopens.
- Light and dark appearances and system back navigation.
- Save local Graft versions from the Sync screen. A checkpoint captures tracked
  SQLite data, Markdown, and ordinary attachments together. The status reports
  pending worktree and staged changes. Drafts and temporary writes live outside
  the versioned Space. Local versions do not require an account or network.

Manually connect a Graft remote in the Sync screen with its HTTPS URL and an
optional access token. Credentials are encrypted with Android Keystore outside
the Space. Use **Publish local version** for the first upload to an empty
remote; **Sync now** saves local changes, fetches, fast-forwards where possible,
and pushes. Disconnect clears local credentials and leaves local files usable.
No network operation runs until requested. This experimental host does not claim
File, Runtime, Adapter, or UI conformance independently of the shared engine.
Markdown and record forms keep disk-backed drafts. Markdown saves automatically;
record forms commit when you press Done. Global search covers filenames, Markdown, and Eidos record content
through read-only Runtime queries. Record matches are grouped by table; opening
a result searches that table with the same text. Results are limited to 100 items,
and unreadable files are reported without discarding other results.

Use **加入后台同步** to enqueue a persistent, one-time WorkManager task. It waits
for network access and for the application to leave the foreground with all
editors closed. An open document, record list or pending share defers file
replacement. Returning to the app refreshes the file list. The Sync screen shows
the current phase and result, and lets you cancel pending or running work. Each
operation has its own native cancellation token; cancellation does not count as
a failed sync or disable the automatic schedule. Cancellation is cooperative;
the repository stays locked until that operation exits. Cancellation does not roll back an
already completed remote publication. Disconnecting
cancels the task and removes its credentials. Publish an empty remote first with
**发布本机版本** before queuing ordinary two-way sync.

Retryable Graft errors use exponential backoff starting at 30 seconds, with up
to five retries. Error counts and messages are stored separately from the Space;
waiting for editors does not consume that failure allowance. Divergence or an
uncertain publication stops for user attention. Credentials are loaded from the
Space's encrypted profile at execution time, never placed in WorkManager input.
Android controls execution timing and may defer tasks for battery restrictions.
Force-stopping the app requires opening it again before scheduled work resumes.
Enable **自动同步** separately for each Space to request a periodic task with a
15-minute interval and network connectivity constraints. The first automatic
attempt is scheduled after 15 minutes; Android may run it later. Foreground and
editor protection also applies to automatic tasks. Divergence, an uncertain
publication or exhausted retries pauses automatic sync and preserves the reason
on the Sync screen. Fix the problem and turn the switch on again to resume.
Successful cycles reset the failure allowance. Reopening a Space reconciles its
saved setting with WorkManager if scheduling was interrupted. Disconnecting
turns automatic sync off. Active transfers use a `dataSync` foreground service
with a quiet notification showing the Space and current phase. Cancel a one-time
transfer from its notification, or pause an automatic schedule. An old notification
cannot pause a newer schedule. Android 13+ asks for notification permission when
you enable automatic sync or enqueue background work; denial does not prevent
sync, but hides its notification from the notification drawer. Android still
controls job quotas and foreground-service time limits; this is not an unlimited
background transfer service. System-interrupted scheduled work can retry from
Graft state; explicitly cancelled tasks remain cancelled.

Use **高级：手动下载远程 Space** in the Space selector to download a custom remote into
a new local Space. Enter a local name, remote URL, and optional access token.
The downloaded Space appears in the selector only after its files and attachments
are available locally. Failed downloads can be retried without replacing the
current Space or leaving an incomplete entry in the selector.

The native transport implements remote configuration, authenticated clone,
fetch, push, and guarded fast-forward updates. Diverged histories retain both
sides and show a pending-merge message. Choose **检查并合并** to save local edits,
fetch the remote version and prepare a merge. Compatible Eidos metadata changes
use the canonical Runtime merge rules. Remaining conflicts appear in a native
review screen: preview both Markdown versions (up to 32 KB each), then choose a
whole local or remote file state with confirmation. For Eidos files this choice
includes all tables and records; per-record and per-cell conflict editors are not
yet available. **保存合并** validates changed Eidos files and creates a local merge
commit; use **立即同步** to upload it. **中止合并** restores the pre-merge local version.
Unfinished reviews reopen with the Space, and ordinary sync/checkpoints cannot
bypass the merge. Downloads currently
run in the foreground. After an interruption, the Space menu offers restarting
the download or removing its incomplete copy; partial-transfer resumption is not
supported. A completed download can finish registration offline after reopening.
A native clone requires a separate empty destination and cannot replace local files.
Existing remotes cannot be silently
replaced by saving another URL. Updating credentials requires reentering the
token; leaving it blank clears the previous token. Release builds require HTTPS;
debug builds additionally allow HTTP on `127.0.0.1` for local protocol tests.

Spaces are stored under the application's private `files/spaces/<id>`
directories; the initial Space uses `personal`. Uninstalling the application removes this data. Export files you
want to keep before uninstalling. Importing a file copies it; it does not edit
the source document provider in place. Import does not automatically collect
external attachments referenced by Markdown or `.eidos` files.

## Development

Requirements:

- JDK 17 or newer (Android Studio's bundled JDK is suitable).
- Android SDK platform 37.0, platform-tools, and NDK `27.1.12297006`.
- Rust **1.99.0** with the `aarch64-linux-android` and `x86_64-linux-android`
  targets. The native build explicitly selects this toolchain; it does not
  change the CLI's toolchain or MSRV. Older standard libraries return
  `Unsupported` for Android file locking used by Graft's storage engine
  ([upstream fix](https://github.com/rust-lang/rust/pull/157038)).
- A host libclang installation for QuickJS bindgen (Xcode/Command Line Tools on
  macOS or libclang development packages on Linux).

Set `ANDROID_HOME` to your SDK directory and `JAVA_HOME` to your JDK if needed.
Use `ANDROID_NDK_HOME` to override the NDK location. SDK paths and build outputs
are intentionally not committed.

From the repository root:

```sh
rustup toolchain install 1.99.0 --profile minimal --target aarch64-linux-android --target x86_64-linux-android
pnpm build:eidos-android
pnpm dev:eidos-android
pnpm test:eidos-android
pnpm test:eidos-android:remote
ANDROID_SERIAL=emulator-5560 pnpm test:eidos-android:compatibility
ANDROID_SERIAL=emulator-5560 pnpm test:eidos-android:process-death
```

The development command requires one running emulator or connected device.
Set `ANDROID_SERIAL` when more than one is present. Debug builds use the
`space.eidos.android.dev` application ID; the release identity is
`space.eidos.android`. Versioning lives in `app/build.gradle.kts`. Release
signing and store publication are not configured.

Direct Gradle commands are also available:

```sh
cd apps/eidos-android
./gradlew :app:assembleDebug
./gradlew :app:testDebugUnitTest :app:connectedDebugAndroidTest :app:lintDebug
```

Gradle builds the JNI library for ARM64 and x86-64 with 16 KB ELF alignment.
The debug APK is `app/build/outputs/apk/debug/app-debug.apk`. Connected tests
exercise actual JNI/QuickJS/SQLite calls, stale revisions, draft recovery, and
the shared Markdown and record editing flows. Instrumentation tests should use a development
emulator because they create temporary files in the debug application's Space.

The remote test command additionally needs the repository's JavaScript
dependencies (`pnpm install`). It starts a loopback-only service using the
published Graft HTTP handler with ephemeral test storage, runs the Rust
transport test, then forwards that service to the selected emulator with
`adb reverse`. It checks SQLite records, Markdown, binary attachments,
authentication, and fetch without premature worktree replacement. The Rust
test also checks diverged histories and rejects overwriting a populated clone
destination. The download UI test retries a failed authentication attempt,
checks rollback of the failed destination, and verifies complete local data
and subsequent synchronization. Set `EIDOS_ANDROID_TEST_CLASS` to one fully
qualified instrumentation test class to run a focused remote check.
The script stops its service and removes its forwarding rule on
exit. No hosted account or real user data is used. Regular device tests exercise
the same roundtrip over Graft's filesystem remote when no test URL is supplied.

The compatibility command requires Python 3 and an explicit development device
serial (replace the example above with your emulator's serial). It builds the
current host CLI and Android APKs, installs only on that device, and exchanges
isolated fixture files through adb. Android creates a file and record; the host
CLI validates and reads it, adds a second record, then Android reopens the result.
The script explicitly stops the test application between phases and checks
Markdown draft recovery after restarting it. Markdown line endings and binary
attachment bytes are checked unchanged. This
checks file interoperability separately from the HTTP Graft transport tests.

The process-death command also requires Python 3, repository JavaScript
dependencies and an explicit development device. It waits for a real native
Graft request to reach a stalled loopback server, then force-stops the test app.
After restarting, it checks intact Markdown, records and attachments, the
interrupted status, and a new local edit. It replaces the stalled endpoint with
the ephemeral Graft service, retries publication and verifies a complete clone.
The script removes its adb forwarding and stops its fixture services on exit.

## Architecture

```text
Compose → EidosModel → SpaceRepository → JNI → eidos-runtime-host → Eidos Runtime
                          │                               │
                   local file IO                        SQLite

Bundled React editor → WebView bridge → SpaceRepository (same native boundary)
```

`SpaceRepository` serializes file, Runtime, and Graft operations off the UI
thread, including calls from different Activities or Spaces. Drafts and app state
are outside the user's Space. A dedicated native worker retains the current query
Runtime so its authenticated pagination cursors remain valid. Switching Spaces or
running Graft closes the query session before files can be materialized.
Embedded Runtime calls retain the same session for schema plans and pagination.
The bridge is bound to the open file and permits only explicit Runtime methods;
it exposes neither arbitrary SQL nor account credentials. The WebView serves
packaged assets and bounded local raster images, and blocks other resource loads.

The shared mobile crate lives in `crates/eidos-mobile-host`, inside the
repository-root Rust workspace. It exposes JNI on Android and C FFI for iOS, and
depends on `eidos-runtime-host`, whose default features are empty. Android embeds
the canonical Runtime; the CLI explicitly enables `serve` for its server, plugin
host, and relay. The Runtime bundle is generated and committed in
`packages/eidos-file/generated/quickjs/`:

```sh
pnpm --filter @eidos.space/eidos-file build:quickjs
```

The native script explicitly enables `planned-transfer-progress` against the
patched Graft mirror. Rust output lives in the root `target/<target>/release/`;
the script copies `libeidos_mobile_host.so` into
`app/build/native/jniLibs/<abi>/` for Gradle packaging.

Android must not implement its own filter, conversion, formula, revision, or
validation semantics. The native system-merge adapter invokes the canonical
`ER-System-Merge-1.0` implementation with three read-only input connections and
one separate private result seed. Each connection has an independent scalar
dispatcher. Native merge commands prepare Graft workspaces, persist semantic
conflicts, accept validated Runtime results, and validate changed Eidos files
before completing a merge. Merge status survives reopening; abort restores the
local version. These commands are covered by native and Android device tests.
The Sync UI exposes review, whole-file resolution, completion and abort through
the same serialized repository boundary.
Native presentation can differ from desktop. Graft is an
external Rust SDK pinned to a Git revision; `Cargo.lock` also pins its transitive
dependencies. It shares the SQLite binding version with the Runtime host and
retains one repository session behind JNI. Calls use the same serialized
repository boundary as file editing. Future sync worktree updates must also
coordinate active editors before replacing files. Restore transport requires a
clean worktree and expected HEAD; a user-facing restore workflow is not yet
available.

## Device sync (experimental)

Desktop and Android can exchange a Space over the same IPv4 LAN without a
cloud account. In Eidos Lite, open **Sync → 设备直连 → 开启设备同步**. On Android,
open **同步**, scan the QR code or paste the pairing code, then approve
the device on the desktop. Pairing codes expire after five minutes and are
single-use. Trust belongs to the computer, independently of each Space. After
pairing, select an available Space on Android to create its separate local copy.
Use **连接设备 → 选择 Space** to add another Space without pairing again.
Only Spaces with device sync enabled on the desktop appear in this list.

During transfer, Android shows Graft's transferred bytes, total bytes and percentage
when the total is available. Snapshot application and Space registration complete
before the Space becomes available. When a transfer has no known total, the page
shows received/sent bytes and the current stage. Sync preserves files without
interpreting their contents, including files requiring unavailable modules such
as `fs_meta`. Format and host capability errors are reported when opening a file;
they do not block copying the rest of the Space. Path safety checks still apply.

The Sync overview shows the paired computer and this phone first, followed by
the current Space and its last confirmed sync time. One primary action starts
sync when the Space is available or checks the connection again when it is not.
Device management and local versions remain secondary entries. The Files tab
always provides access to the local copy.

Keep the desktop Space open and its device service running. Use Android's
device-sync action to exchange changes; both devices must be online. Restart
the device service after restarting Lite. If the desktop LAN address changes,
Android automatically looks up the new endpoint through local DNS-SD when the
saved endpoint is unavailable. Discovery matches the paired certificate fingerprint
and Space ID, then verifies pinned TLS before saving an address. Networks that
block multicast can still use a current QR code to update the endpoint without
another approval. Remove a device
from the desktop panel to revoke its access to all enabled Spaces. Builds that
used per-Space identities require a one-time pairing with the new computer identity.

Transfers use TLS pinned to the certificate in the pairing code. Android stores
device credentials in its encrypted profile store. Graft uses a separate
`eidos-peer` remote; the Cloud `origin` and account remain unchanged. Device and
Cloud sync share the repository operation boundary. Device sync automatically
merges divergent histories when the changes are compatible, including edits to
different files. Eidos candidates pass Runtime validation before completing the
merge. Actual content conflicts retain both versions and require the complete
desktop Sync merge workspace. Android retains an editable local copy and shows
the desktop review guidance. After resolving conflicts on the desktop, tap
**立即同步** on Android to receive the reviewed result and include any edits
made on the phone while waiting.
It has no Internet relay, NAT traversal, or automatic background device sync.
Progress reports operation stages and transferred bytes.
