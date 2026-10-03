# Eidos iOS (experimental)

Native SwiftUI host for a complete local Space, with bundled React Markdown and Eidos File editors in WKWebView. Files remain usable offline without an account.

## Build and run

Requires Xcode 15.4 or newer with an installed iOS simulator, XcodeGen, Rust, and the repository's pnpm dependencies. The build does not install tools or download simulator runtimes.

```bash
pnpm install
rustup target add aarch64-apple-ios-sim
bash apps/eidos-ios/scripts/build.sh
open apps/eidos-ios/EidosIOS.xcodeproj
```

Select the `EidosIOS` scheme and an Apple Silicon iOS simulator in Xcode. The generated project and build output are ignored; `project.yml` is the project source. To install from the command line, use an existing simulator UUID:

```bash
xcrun simctl install <simulator-uuid> apps/eidos-ios/build/DerivedData/Build/Products/Debug-iphonesimulator/EidosIOS.app
xcrun simctl launch <simulator-uuid> space.eidos.ios
```

Physical-device builds require the explicit `aarch64-apple-ios` Rust target, `bash apps/eidos-ios/scripts/build.sh iphoneos`, and your own signing configuration. Device signing, distribution, and App Store packaging are not configured or verified. Intel simulator builds are not configured.

## Local workflow

- Use **添加文件** to create a Markdown note, Eidos File, or folder in the current directory, or import a file up to 64 MiB through the system picker. Import copies the file into the app's local Space without replacing existing files; it does not edit the provider's original.
- Browse folders and use **上一级** to return. Search filters filenames in the current directory. Long-press a file to rename, export a snapshot through the system share sheet, or move it to the private recycle bin. **Space 操作 → 回收站** restores files and folders to their original paths; conflicting names are never overwritten. Ordinary files open the system share sheet. Folder export and whole-folder import are not yet available.
- Markdown opens in preview, with **编辑** and **源码** modes (up to 2 MiB). Native storage writes a private recovery draft before attempting each atomic save; **返回** waits for pending saves. Reopening restores the draft with its original content digest. Conflicting external edits remain intact: use **保留草稿并返回**, retry, or explicitly confirm discarding the draft to reload the disk version. A pending draft must be saved before renaming its file or parent directory.
- Eidos File uses the shared table, record, and built-in View editors. Create records, edit fields, search, and switch Views while offline. The native bridge never accepts raw SQL from the WebView.
- The app's Documents/Space directory is visible through iOS File Sharing. Import currently copies one file, not its sibling attachment directory. Local raster image references resolve inside the Space; remote images and active embedded content are blocked.

## Local Graft versions

Open **Space 操作 → 本地版本** to inspect local changes and save a checkpoint. A checkpoint captures the complete Space, including SQLite data, Markdown, and ordinary attachments. It requires no account or network. The screen lists the latest 50 commits. Opening history does not initialize a repository; saving the first version does. Recovery drafts and the recycle bin live outside the versioned Space.

The iOS host uses the same pinned Graft SDK revision as Android. Runtime connections close before version operations, and the native storage queue serializes file edits and checkpoints. The WebView cannot invoke Graft operations. Existing merge conflicts block checkpoints. History restore, remote configuration and transfer, merge review, and account integration are not yet exposed on iOS.

## Architecture

`Sources/` owns the file picker, sandboxed local Space, atomic Markdown writes, navigation, and WKWebView resource/message boundaries. `web/` owns the iOS entry point, using `@eidos.space/markdown`, `@eidos.space/eidos-file-ui`, and the Serve Runtime client adapter. Its initial shell was copied from the Android embedded editor; it is independent of Android assets and JNI builds. Shared editor behavior remains in the shared packages.

`native/` is an independent Rust workspace producing a C static library. It depends on the existing `apps/cli/qjs-host` with HTTP serving disabled. A dedicated Rust thread keeps SQLite and QuickJS sessions alive across calls, including authenticated cursors and schema plans. The committed canonical QuickJS bundle in `apps/cli/qjs-host/bundle` provides Eidos File semantics; Swift does not implement field conversion, querying, validation, or revision rules. Refresh that bundle through the repository's QuickJS build when Runtime sources change.

`eidos://app/editor/` serves only bundled editor resources. `eidos://app/document/` serves supported local raster images with canonical path and symlink containment checks. Only main-frame editor messages are accepted; the native side selects the open file and allowlists Runtime operations. External HTTP(S) links open through the system, outside the editor.

## Validation

```bash
pnpm --filter @eidos.space/ios-editor typecheck
pnpm --filter @eidos.space/ios-editor build:web
cargo fmt --manifest-path apps/eidos-ios/native/Cargo.toml --check
cargo clippy --manifest-path apps/eidos-ios/native/Cargo.toml --all-targets --locked -- -D warnings
cargo test --manifest-path apps/eidos-ios/native/Cargo.toml --locked
xcodebuild -project apps/eidos-ios/EidosIOS.xcodeproj -scheme EidosIOS \
  -destination 'platform=iOS Simulator,id=<simulator-uuid>' \
  -derivedDataPath apps/eidos-ios/build/DerivedData test
```

Tests cover local save/conflict handling, draft recovery with stale digests, folder/rename/trash/restore operations, export snapshot isolation, path escape rejection, native Runtime creation/reopening and revision enforcement, Graft checkpoints, and WebView editing across application restarts.

## Android alignment

| Area                                    | iOS status                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Bundled Markdown and Eidos File editors | Shared components, built-in Views, touch toolbar, schema-ready initialization                                |
| Local files                             | Folder browsing/creation, file import/export, rename, recoverable trash; whole-folder transfer still pending |
| Recovery                                | Markdown drafts persisted outside Space; native record/share drafts still pending                            |
| Search                                  | Current-directory filename filtering; global Markdown/record search still pending                            |
| Local Graft                             | Offline checkpoints and latest 50 versions                                                                   |
| Remote Sync and accounts                | Pending: staging OAuth/Keychain, remote transfer, multiple Spaces, merge review, background scheduling       |
| Attachments and sharing                 | Ordinary file import/export; record attachment management and incoming share extension pending               |
| Plugins and Publish                     | Pending                                                                                                      |

## Current boundaries

This is an experimental local editor. Remote Graft sync, account login, staging authentication, plugin views/installation, Publish, and record attachment management are not connected. The UI explicitly identifies the offline-only account/sync boundary. Future account integration must target staging first and must not gate local file access. No service deployment is part of this application build. The recycle bin is app-private and is not a synchronized deletion history.

Only one document/scene is active at a time. Appearance is captured when opening a document. Do not replace an open `.eidos` database through Files; close the editor before external replacement. Back navigation flushes editor writes; abrupt process termination can still lose keystrokes that have not reached native draft storage. Single-file exports do not collect referenced attachments.
