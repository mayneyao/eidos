# Eidos iOS (experimental)

Native SwiftUI host for a complete local Space, with bundled React Markdown and Eidos File editors in WKWebView. Files remain usable offline without an account.

The interface supports English and Chinese. Open **Space actions → Language** in the file browser to choose **Follow system**, **中文**, or **English**. The default follows the system language, using Chinese for `zh` and English for other languages. The choice is saved for the app and share extension and applies to the native interface and bundled editor without reopening the Space.

To remove a local Space, open its name menu and choose **删除此 Space 的本地数据**.
After confirming, authenticate with Face ID, Touch ID, or the device passcode.
Cancellation or unavailable device authentication leaves the Space intact.
Local files, history, drafts and sync associations are removed; paired devices
and copies on other devices remain. Deleting the last Space creates a new empty one.

## Build and run

Requires Xcode 15.4 or newer with an installed iOS simulator, XcodeGen, Rust, and the repository's pnpm dependencies. The build does not install tools or download simulator runtimes.

```bash
pnpm install
rustup toolchain install 1.99.0
rustup target add --toolchain 1.99.0 aarch64-apple-ios-sim
bash apps/eidos-ios/scripts/build.sh
open apps/eidos-ios/EidosIOS.xcodeproj
```

Select the `EidosIOS` scheme and an Apple Silicon iOS simulator in Xcode. The generated project and build output are ignored; `project.yml` is the project source. To install from the command line, use an existing simulator UUID:

```bash
xcrun simctl install <simulator-uuid> apps/eidos-ios/build/DerivedData/Build/Products/Debug-iphonesimulator/EidosIOS.app
xcrun simctl launch <simulator-uuid> space.eidos.ios
```

Simulator builds use ad-hoc signing so Keychain works during testing. Physical-device builds require the explicit `aarch64-apple-ios` Rust target, `bash apps/eidos-ios/scripts/build.sh iphoneos`, and your own signing configuration, including the `group.space.eidos.ios` App Group for both app and share extension. Intel simulator builds are not configured.

### TestFlight packaging

Versions are defined by `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in
`project.yml`; both the app and share extension inherit these values. Increment
the build number for each upload. Keep `RELEASE_NOTES.md` aligned with the
candidate. The app and extension include privacy manifests for the required
reason APIs they use.

After preparing the device native library and editor assets, generate the Xcode
project and archive the `EidosIOS` scheme with the Release configuration and a
generic iOS destination. Set `DEVELOPMENT_TEAM` to your Apple developer team and
use automatic signing for both targets. Export with the `app-store-connect`
method, then upload using Xcode Organizer or `xcodebuild -exportArchive` with
an upload destination. Signing credentials belong in the local keychain or
secure CI secrets, never in this repository.

A successful archive or upload does not mean a build is available to testers.
Confirm Apple processing, export-compliance status, and TestFlight group access
in App Store Connect before distributing a testing link. External testing may
also require Beta App Review.

## Local workflow

- Use **添加文件** to create a Markdown note, Eidos File, or folder in the current directory, or import a file up to 64 MiB through the system picker. Import copies the file into the app's local Space without replacing existing files; it does not edit the provider's original.
- Browse folders and use **上一级** to return. Search covers filenames, nested Markdown text and canonical Runtime records; record results open the matching table with its search applied. Long-press a file to favorite, rename, export a snapshot, or move it to the private recycle bin. **Space 操作 → 回收站** restores files and folders without overwriting conflicting names. Folder import/export copies visible files and rejects symlinks and live SQLite WAL files.
- Markdown opens directly in the editor (up to 2 MiB). Changes coalesce into automatic saves; **返回** and background transitions flush pending writes. Native storage writes a private recovery draft before each atomic save. Reopening restores the draft with its original digest. Conflicting external edits remain intact: retain the draft, retry, or explicitly discard it to reload disk content.
- Eidos File uses the shared table, record, and built-in View editors. New records remain private drafts until **保存记录**; unfinished drafts resume on reopening. Calendar date-field selection and layout settings live in View configuration. Record actions open in a bottom sheet. The native bridge never accepts raw SQL from the WebView.
- The title menu creates and switches local Spaces, restoring the last selection on launch. Favorites, recent files, plugin enablement/settings and drafts are isolated per Space. Installed plugin packages are shared by the device. Enable a plugin under **Space 操作 → 插件**; its declared navigation pages appear after **资料** and **同步** in the bottom tabs, matching Android. Up to two plugin pages appear directly; with more pages, one remains direct and the rest appear under **更多**. Switching tabs retains directory and page state. Opening a file hides the tabs until returning.
- The system share extension stages text, links, images and documents in the private shared inbox. Open **接收分享** to save to a folder or choose an Eidos File and fill a record. Share drafts survive closing the editor. If submission is interrupted, inspect the destination before discarding or retrying the draft.
- The app's Documents/Space directory is visible through iOS File Sharing. Import currently copies one file, not its sibling attachment directory. Local raster image references resolve inside the Space; remote images and active embedded content are blocked.

## Local Graft versions

Open **Space 操作 → 本地版本** to inspect local changes and save a checkpoint. A checkpoint captures the complete Space, including SQLite data, Markdown, and ordinary attachments. It requires no account or network. The screen lists the latest 50 commits. Opening history does not initialize a repository; saving the first version does. Recovery drafts and the recycle bin live outside the versioned Space.

Android and iOS share the portable Graft and semantic merge modules in `crates/eidos-mobile-host`. Runtime connections close before version operations, and the native storage queue serializes edits and checkpoints. The WebView cannot invoke Graft operations. An existing native merge blocks checkpoints. LAN conflicts are reviewed on the desktop; the phone keeps a normal editable local copy while awaiting resolution.

## LAN Sync

Transfer stages show Graft's transferred bytes, total bytes and percentage when
the total is available. Snapshot application and Space registration complete before
the Space becomes available. Sync does not scan database contents or run full
Eidos File validation. Files requiring unavailable host features, such as `fs_meta`,
are copied unchanged. Format and host capability errors are reported when opening
a file, without blocking the rest of the Space. Path safety checks still apply.

**同步** focuses on LAN device sync. Scan the QR code from **Sync → 设备直连** on Eidos Lite, approve the phone on the desktop, then choose a Space to download. **使用配对码** also accepts a pasted invitation. If the camera is unavailable or permission is denied, use the pairing-code fallback. The app creates a separate local copy and adds it to navigation only after full transfer and local snapshot application. An interrupted download stays outside normal navigation and reuses its directory on retry. Paired Spaces expose one sync action, transferred bytes, cancellation and the last confirmed transfer time. **刷新设备状态** distinguishes an unavailable computer from an online computer whose Space is not open for sync. Keep the phone in the foreground and the desktop Space open on the same network; downloaded files remain usable offline. **本地版本** provides manual checkpoints and recent history without another tab.

After submitting a pairing code, **等待电脑授权** identifies the computer. Accept the native Eidos Lite pairing dialog there. If the computer app is in the background, click its system notification or open **Settings → Devices**. Cancel or return from pairing to stop the wait and dismiss the pending desktop request when reachable. Rejection and expiry are reported separately; generate a new code to try again.

The overview shows the paired computer and this phone first, followed by the current Space and its last confirmed sync time. One primary action starts sync when available or checks the connection again when it is not. Device checks do not block pairing input or file navigation.

TLS pins the invited certificate; Bonjour only rediscovers its address. With no paired computer, Sync shows connection onboarding. Otherwise, the device picker selects one computer and the list below shows only its Spaces. Downloaded Spaces offer **同步** and retain their local copies when offline; other offered Spaces show **下载**. Each Space menu opens its files or **本地版本**. Use **连接新设备** in the picker to pair another computer; **管理此设备** contains removal. Browsing a paired computer does not require the originally paired Space to remain open. After a restart or address change, sync tries saved endpoints and Bonjour candidates while retaining the pinned identity. Stop interrupts both requests and discovery. Disconnecting a Space or removing a computer preserves local files and history. Each phone uploads its checkpoint to a private incoming Remote; the desktop automatically merges compatible changes and publishes validated history. For a true conflict, the phone retains its files and directs you to **Sync** on the desktop. Resolve it there, then tap **立即同步** on the phone. Phone edits made while waiting are included in the next attempt. Conflict handling never records a successful sync time or opens a whole-file choice UI on the phone.

The standard build uses Rust 1.99.0 and the same pinned, patched Graft source as Android. The dependency and Rust workspace are generated under ignored `build/native-workspace`, without changing Cargo's shared Git cache. Patch application is isolated from the parent repository and verified before building. See the [Mobile LAN v1 checklist](ALIGNMENT.md) for verification and outstanding device gates.

Device Sync uses Graft's shared `fetch_for_checkout` operation to plan missing
external files and SQLite snapshots together before downloading their bodies.
The UI shows “获取清单”, then “下载数据” once the native total is planned, and
“写入文件” only after target data has been downloaded and verified. Download
progress then uses a fixed compressed-byte total across all databases, excluding
cached frames and counting shared frames once. Metadata and snapshots share one
operation counter. Until the plan is known, the UI shows preparation and received
bytes instead of a percentage based on an expanding denominator. After download, the snapshot is written and the Space is registered without
scanning database contents.

Account login, cloud Sync and Publish entry points are hidden from the mobile UI. Background LAN scheduling, phone-to-phone sync and Internet relay are outside this version; see [ALIGNMENT.md](ALIGNMENT.md).

## Architecture

`Sources/` owns the file picker, sandboxed local Space, atomic Markdown writes, navigation, and WKWebView resource/message boundaries. `web/` owns the iOS entry point, using `@eidos.space/markdown`, `@eidos.space/eidos-file-ui`, and the Serve Runtime client adapter. Its initial shell was copied from the Android embedded editor; it is independent of Android assets and JNI builds. Shared editor behavior remains in the shared packages.

`crates/eidos-mobile-host` produces the C static library with its `ffi` feature in the repository-root Rust workspace. It shares Runtime sessions and Graft orchestration with Android; JNI remains Android-only. A dedicated Rust thread keeps SQLite and QuickJS sessions alive across calls, including authenticated cursors and schema plans. The committed canonical QuickJS bundle provides Eidos File semantics; Swift does not implement field conversion, querying, validation, or revision rules.

The build explicitly enables `ffi,planned-transfer-progress` against the pinned upstream
Graft mirror. Rust output lives in the root `target/<target>/release/`; the script
copies `libeidos_mobile_host.a` into `build/native/<platform>/` for Xcode. The
canonical QuickJS bundle lives in `packages/eidos-file/generated/quickjs/`.

`eidos://app/editor/` serves only bundled editor resources. `eidos://app/document/` serves supported local raster images with canonical path and symlink containment checks. Only main-frame editor messages are accepted; the native side selects the open file and allowlists Runtime operations. External HTTP(S) links open through the system, outside the editor.

## Validation

Run these commands from the repository root:

```bash
pnpm --filter @eidos.space/ios-editor typecheck
pnpm --filter @eidos.space/ios-editor build:web
cargo fmt --all --check
cargo clippy -p eidos-mobile-host --features ffi --all-targets --locked -- -D warnings
cargo test -p eidos-mobile-host --features ffi --locked
xcodebuild -project apps/eidos-ios/EidosIOS.xcodeproj -scheme EidosIOS \
  -destination 'platform=iOS Simulator,id=<simulator-uuid>' \
  -derivedDataPath apps/eidos-ios/build/DerivedData test
```

Tests cover local saves, stale-digest recovery, folder transfer, native Runtime validation, Graft divergence/reopen/resolution, Space selection, real WKWebView editing and share-draft submission. A disposable desktop peer fixture tests pinned-TLS transfer in both directions. Some XCUITest WebView accessibility queries currently fail on the simulator; the full UI suite is not a passing gate yet.

## Android alignment

| Area                                    | iOS status                                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Bundled Markdown and Eidos File editors | Shared components, built-in Views, touch toolbar, schema-ready initialization                                                      |
| Local files                             | Folder browsing/creation and transfer, file import/export, rename, recoverable trash                                               |
| Recovery                                | Markdown, new-record and share drafts persisted outside Space                                                                      |
| Search                                  | Global filename, Markdown and Runtime record search; native result sheet                                                           |
| Local Graft                             | Offline checkpoints and latest 50 versions                                                                                         |
| LAN Sync                                | Pinned desktop pairing, isolated downloads, foreground transfer and desktop conflict continuation                                  |
| Attachments and sharing                 | Separate photo/document pickers, attachment management, share inbox and record destinations                                        |
| Plugins                                 | Native SwiftUI management; WebView document/table/page views, actions, settings and native connections; plugin themes are disabled |

## Current boundaries

In `.eidos` files, the native header places a table dropdown beside the filename.
**配置 → 字段** opens a bottom sheet for the current View's visibility and field order.
Tap a field for its shared property editor, or create one from the list. Back
returns to the same list and search. Field property changes save immediately
through the canonical Runtime; deletion requires confirmation.

Markdown and record File fields can import images and files through the system picker. Imports are stored beside the document under `assets/`, with at most 100 files, 64 MB per file and 128 MB per batch. Eidos File entries are allocated by the canonical Runtime.

This is an experimental host, not a verified App Store release. No service deployment is part of this application build. The recycle bin is app-private and is not a synchronized deletion history.

Open **Space 操作 → 插件** to review permissions and install plugins. Successful
installation enables the plugin in the originating Space. Updated packages need
fresh enablement in other Spaces. See the
[shared mobile plugin host](../../packages/mobile-plugin-host/README.md).
Connection keys use Keychain and are never sent to guest JavaScript or stored
in the Space. Map and Chart views are available in the shared `.eidos` editor.

The native plugin page separates **发现** (search and categories) from **已安装**
(Space-specific switches and plugin details). Local package import is in the
page's **更多** menu. The file browser places search beside the create menu;
search opens a bottom sheet. **Space 操作 → 排序** offers name, modification time,
and file type in either direction, always keeping folders first. The order is
remembered across launches.

The file home uses a flat Favorites / Recent / Files list and a fixed full-width bottom navigation bar. File rows expose a More button; long press opens the same scrollable action sheet. Plugin management, plugin README pages and tools open full screen. Markdown continues to use the shared WebView editor.

Only one document/scene is active at a time. Appearance is captured when opening a document. Do not replace an open `.eidos` database through Files; close the editor before external replacement. Back navigation flushes editor writes; abrupt process termination can still lose keystrokes that have not reached native draft storage. Single-file exports do not collect referenced attachments.
