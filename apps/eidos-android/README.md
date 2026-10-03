# Eidos for Android

An experimental native Android host for local Markdown and Eidos File data.
The application shell uses Kotlin and Jetpack Compose. Markdown and `.eidos`
files open in a bundled WebView editor by default. There is no local HTTP server.
It builds independently of the Web and Electron applications.

## Native dependency status

The Git dependency currently pins Graft revision
`5c99ad07ee1af7b66432c94c6e919c7faa5cacd5`. Development APKs tested for LAN sync
also include [the Android runtime patch](patches/graft-android-runtime.patch):
Android-compatible DNS resolution and cached checks of unchanged SQLite files.
Those changes are not yet included in the pinned upstream revision. A stock
`build-native.sh` rebuild does not apply them and therefore does not reproduce
the patched APK's networking and checkpoint performance. Until the dependency
is updated, apply the patch to a separate checkout of that exact Graft revision
and build an isolated CLI workspace with its `graft-sdk` path dependency pointing
to that checkout. Do not modify Cargo's shared Git cache.

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

Choose **文件操作 → 使用原生编辑器** to return to the existing Compose editor.
Its menu offers **使用共享编辑器** to switch back. The choice is remembered.
Files, account, Sync, and Publish remain native. Table favorites and quick record
creation continue to use the native editor.

The view selector reads saved views, including their query and layout. **新建视图**
adds a Grid, Gallery, Kanban, Calendar, Form or Feed view to the local file using
the shared Runtime and each view plugin's default configuration. Creation is
disabled when required fields are absent, such as a Select field for Kanban.
Existing saved query/layout settings are retained. Records open as full pages
on the phone. Use the
native editor for attachment imports and Markdown links to other local documents.
View renaming/deletion and third-party plugin pages are not exposed in this shell.
Local raster images are supported; remote images and network requests are blocked.
The native editing features described below remain available through the switch.

The Android Gradle build runs `pnpm --filter @eidos.space/android-editor build:web`
and packages its output as assets. Run `pnpm install` from the repository root
before building. `EmbeddedEditorTest` verifies local Markdown saves, canonical
record writes, editor-shell reuse, coalesced Markdown saves, immediate-exit saves,
session isolation, and switching back to the native editors.

## Plugin open-with preview

The file menu's **打开方式** sheet offers the default opener and bundled
read-only file views. The text preview uses a committed UTF-8 snapshot (up to
2 MiB). A development build can also bundle the existing GPX Viewer directly
from its source checkout: set `eidos.pluginSources` in the ignored
`local.properties`, or `EIDOS_ANDROID_PLUGIN_SOURCES` in the environment.
GPX Viewer reads only the selected file (up to 16 MiB), supports refresh,
MapLibre workers, tracks, playback and charts, and loads map resources only
from its declared OpenFreeMap origin. Network access is shown in the chooser.
Plugins run in separate WebViews without the editor's native bridge. Opening
a plugin does not change the default editor. Open **当前文件夹操作 → 插件市场**
to browse the shared registry or import a local `.eidos-plugin` package. Review
its read/network/worker permissions, install it on the device, then enable it
separately for the current Space. Incompatible packages are rejected before
installation. See
[Android file views](plugins/README.md) for the supported manifest profile,
resource boundaries and local checks.

## Account-based Sync

The Sync overview shows the current Space's observed sync status and one primary
action. Open the account icon to manage login, **云端 Space** to browse and download,
or **本地版本** to save a local checkpoint. **同步设置** contains custom remote
connections, first publication, merge checks, background queue controls and
disconnect. Empty remotes need **同步设置 → 发布本机版本** before regular sync.
Cloud downloads show a separate confirmation page; no file counts or previews
are shown before that data is available.

Open **Sync → 登录 Eidos 账号** to sign in using the system browser. The native
app uses OAuth authorization code + PKCE (S256), a single-use state check, and an
exact app callback. Development builds use `staging.eidos.space` and
`sync-staging.eidos.space`; release builds use the production origins. Their
OAuth client IDs and callback schemes are separate.

After signing in, enable Sync for the current local Space or choose a cloud
Space to download into a separate local Space. Sync access and quota are
enforced by the account and Graft services. Use the account management link
to review the subscription and device authorization. Existing custom Graft
servers remain available through the advanced manual connection controls.

Downloads show the current stage and actual bytes received, including retries.
The transfer indicator is indeterminate because Graft discovers remote objects
as it works; received bytes are transfer data, not the final folder size. Keep
the app open until import completes. Progress resets after a failure or restart.

Access tokens, refresh tokens, and pending login verifiers are encrypted with
Android Keystore outside Space files. Account-linked Spaces store only an
account reference; foreground sync, background sync and resumed downloads
resolve fresh credentials before transfer. Signing out removes local account
credentials, retaining offline files. Signing into another account does not
authorize that account to sync the previous account's Spaces. Logging out of
the app does not sign the system browser out of the website.

The account service currently records the device platform as `unknown`, with
an `Android · <model>` display name, to preserve its existing platform schema.
The account repository registers `android.dev.eidos.space` with callback
`space.eidos.android.dev://oauth/callback` and `android.eidos.space` with callback
`space.eidos.android://oauth/callback`. A staging-only protocol smoke test lives
in that repository at `scripts/android-oauth-staging.mjs`; it uses the existing
private staging test account fixture without printing credentials.

For an opt-in native staging check, set `ANDROID_SERIAL` explicitly and run
`python3 apps/eidos-android/scripts/test-account-staging.py --account-repo /path/to/eidos.space`
from the product repository. This installs the debug/test APKs and uses isolated
test account preferences. The Android device creates the verifier and exchanges
the returned code itself; host-side test credentials never enter the APK.
The account repository must contain its private staging smoke account fixture.
Add `--clone-cloud` to publish and download a small Markdown fixture through
the native Graft HTTPS transport. This creates a uniquely named test Space in
the staging test account and verifies the downloaded bytes. Local test copies
are removed after the check; the remote test Space remains in that test account.
Login and cloud-list checks alone do not verify Graft's native network transport.

## Publish

Open a Markdown or `.eidos` file's **发布** menu to publish a hosted copy. The
same action is available in the editor's **文件操作** menu. Sign in with the
existing Eidos account, choose a publication path and access mode, then tap
**发布网页**. Publish does not require enabling Sync. Debug builds use
`publish-staging.eidos.space`; release builds use `publish.eidos.space`.

The native publisher shares attachment discovery and upload logic with the CLI.
It uploads a private SQLite snapshot that includes committed WAL data. Referenced
local attachments are included. The page shows upload bytes and processing
status; keep the app open until completion. Background publishing is not supported.

Reopen **发布** to copy or share the link, update the same webpage, or cancel
publication. Local edits require **更新网页** to reach the hosted copy. Canceling
publication leaves local files intact. Publication bindings are stored outside
Space data and isolated by account, environment, Space, and source path. Changing
the source path does not automatically move its publication binding.

Publish Free supports public Markdown pages. `.eidos`, password access and
private pages require the corresponding Publish entitlement. A private page is
accessible to the signed-in publishing account. Forms and response collection
are not available in Android yet.

For an opt-in staging transfer check, add `--publish-cloud` to the native account
test command above. It publishes synthetic content, updates the same link, checks
the served Markdown, then unpublishes the fixtures. Pro-only branches run only
when the private fixture account has Pro. Published test versions remain subject
to the staging service's retention policy.

## Files and editing

Data files use a compact table strip and a single view/filter/sort/field toolbar.
Tap the search icon to expand record search; an active query remains visible.
The record editor aligns labels and values in property rows. Select values open
their picker directly, while field menus contain clearing and exact rating input.
Attachments open a separate management sheet. Edits remain local drafts until
**完成** commits the record through the shared Runtime.
Relation values display target record labels resolved by the shared Runtime in
both lists and record forms. Missing targets and empty labels have readable
fallbacks; stored relation IDs remain unchanged. Relation selection is not yet
editable on Android.

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
  screen. The create sheet opens a new record directly in a favorite table.
  Missing targets remain removable; a missing table never redirects a new
  record to another table. Favorites are local preferences, not synchronized
  Space content.
- Create, read, edit, and search UTF-8 Markdown. Edits have recoverable local
  drafts and commit automatically after a pause in typing. Done and Back also
  commit pending edits. Each write is atomic and checks the previous content hash;
  an external change preserves the draft and reports a conflict instead of being
  overwritten. The source editor includes a selection-aware toolbar for headings,
  emphasis, lists, tasks, quotes, code, and links. Choose Image to copy a local
  raster image through the Android document picker and insert it at the selection.
  Images are stored under `assets/` beside the document, with escaped relative
  links that remain portable across devices. Invalid images and files over 16 MB
  are rejected. If saving the document conflicts, its draft and imported image
  remain available for recovery. Markdown reading uses native
  text rendering. Task checkboxes can be toggled directly while reading; each
  toggle preserves the surrounding source and uses the same stale-file guard as
  editing. Code samples and escaped task markers remain ordinary text.
  Relative links open Markdown and Eidos files within the same
  Space, with Back returning to the source document. HTTP(S) and email links open
  external apps. Relative raster images load offline from the same Space, with
  missing images shown as placeholders. Image files are limited to 16 MB;
  decoding scales the longest edge to at most 2048 pixels and uses a 48 MB
  image budget per document. Remote images, SVG, document anchors, and custom
  Eidos Markdown extensions are not yet supported. Text editing is limited to
  2 MB per file.
- Create `.eidos` files, switch tables, query records in pages of 50, search
  text fields, and create/update/delete records through the canonical Runtime.
  Record forms save local drafts outside the Space. Reopen the same record, or
  choose New record in the same table, to recover unfinished input. Back offers
  keeping the draft or discarding it; successful submission clears it. Drafts
  retain their original file revision, so later changes are never silently
  overwritten. Share forms keep their field edits and selected attachment field
  with the pending share. Use Continue filling the shared record in the destination
  picker after reopening. Each target file/table retains its own draft; successful
  submission or removing the pending share clears its drafts and staged copies.
  Integer fields with a rating display offer touch targets for compact nonnegative
  scales up to 10, plus direct numeric input. Zero and an empty rating remain
  distinct, and values outside the display range retain their full int64 value.
  Sort by one compatible field in ascending or descending order, including
  across pages and searches. Combine filters with search and sorting: all
  conditions must match, with null checks, scalar equality, text matching, and
  ordered comparisons. Select a saved View to apply its complete canonical query,
  including nested filters and multi-field sorting. Supported View queries appear
  as native record lists; desktop custom View scripts are not executed. Additional
  mobile filters narrow the View, and resetting a mobile sort restores its saved
  order. Save the current filters, sorting, and field visibility as a new Grid View
  inside the file. Search text is temporary and is not stored in the View.
  Choose which secondary fields appear in record
  lists; these per-table display preferences remain local to the Space.
  Simple source fields, including Select and Multi-select, are editable.
  Option values use their catalog colors in forms and record lists; Multi-select
  supports adding and removing individual values without replacing other selections.
  Formula and other computed results are
  evaluated by the existing Runtime. Unsupported field editors remain read-only.
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
  open a prefilled native record form. Review the fields and press Done to commit
  through the Runtime. The complete text is placed in the writable text/URL
  label field, or the first writable text field when the label is unsuitable.
  File shares can also target a writable File field; select the destination
  field in the record form before pressing Done. Files are copied to an isolated
  directory under `assets/` beside the `.eidos` file, with relative resource URIs
  and metadata allocated by the canonical Runtime. Imports support up to 100
  files, 64 MiB per file and 128 MiB total. Failed imports clean up their new
  copies when the original database revision is unchanged. An uncertain commit
  retains the bytes and asks you to inspect the table before retrying.
  Native forms show attachment names, sizes and media types, and can remove
  references without deleting the underlying files. Tap Open to preview supported
  local or inline raster images in a native dialog, or use Android's app chooser
  for other formats. The record form stays mounted while previewing, preserving
  unsaved edits. Relative resources remain confined to the data file's directory;
  missing files, traversal and symbolic links are rejected. HTTPS entries open
  in a browser only when requested. Local external opens receive read-only
  content URIs for cache snapshots, never direct Space paths. Opening is limited
  to 64 MiB per file; image previews are downsampled to a 2048-pixel maximum edge.
  SVG is offered to external applications rather than rendered in the app.
  Opening another preview removes snapshots older than 24 hours and bounds
  the cache to approximately 256 MiB. Pending shares and their record form drafts
  are recovered from private storage after the application reopens.
- Light and dark appearances, system back navigation, and native date/option
  controls.
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
the native Markdown editing flow. Instrumentation tests should use a development
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
Compose → EidosModel → SpaceRepository → JNI → qjs-host → Eidos Runtime
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

The JNI crate lives in `apps/cli/android-host`, inside the existing Rust
workspace. It depends on `qjs-host` with its `serve` feature disabled, so the
Android binary does not embed the CLI Serve UI, plugin server, or relay.
The default CLI build retains those features. The Runtime bundle remains
generated from `packages/eidos-file`:

```sh
pnpm --filter @eidos.space/eidos-file build:quickjs
```

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
open **Sync → 设备直连**, scan the QR code or paste the pairing code, then approve
the device on the desktop. Pairing codes expire after five minutes and are
single-use. Trust belongs to the computer, independently of each Space. After
pairing, select an available Space on Android to create its separate local copy.
Use **已配对设备 → 查看 Space** to add another Space without pairing again.
Only Spaces with device sync enabled on the desktop appear in this list.

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
merge. Actual content conflicts retain both versions and require review on the
device where the merge stopped; Android opens its merge review. After resolving
the conflicts, sync again to send the merged version to the other device.
It has no Internet relay, NAT traversal, or automatic background device sync.
Progress reports operation stages and transferred bytes.
