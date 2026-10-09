# Eidos Android 0.2.0

This release adds local file hooks and improves Markdown editing, draft safety
and plugin communication. Android 9 or newer is required.

## What's new

Compatible plugins can run isolated file hooks after local Markdown saves and
renames. An open document follows a hook-triggered rename. Enable the plugin
in the Space where you want its automation to run.

## Improvements

- Long record titles wrap within the mobile layout.
- Local version controls distinguish inspecting history from saving a checkpoint.
- Table Content settings explain how a Text field stores Markdown record bodies.

## Bug fixes

- Touch selection works inside Markdown links, and Backspace deletes individual
  characters without removing the entire URL. Reserved scrollbar space reduces
  layout shifts when entering edit mode.
- Moving a file to the recycle bin protects pending recovery drafts and requires
  confirmation before removing the open document.
- Unchanged table and field settings no longer create spurious schema changes.
- Plugin binary RPC responses use the expected envelope, allowing file and
  attachment responses to reach the embedded plugin host.

## Install

Download `eidos-android-0.2.0.apk` and verify it against `SHA256SUMS`. The APK
supports ARM64 and x86-64. Install it over the previous stable APK to retain local
data; the signing identity and application ID are unchanged. The development
app remains separate.

## Compatibility and scope

File hook plugins require Plugin API 3.3.0; Eidos Lite 0.23.0 supports the same
hook contract. Local files remain usable offline. Keep the app in the foreground
during LAN transfers and review conflicting changes on Desktop. Mobile cloud
account and hosted-sync entry points remain unavailable. Distribution uses the
GitHub APK channel; Google Play publication is not configured.
