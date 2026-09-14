## Improvements

- **Publish**: The Publish panel now opens from a cached plan and publishes optimistically, so the form is ready immediately instead of waiting on an account check. The service still enforces your entitlement, and the panel only flags a restriction when your account actually needs attention.
- **Account & Services**: Settings now has dedicated Sync and Publish sections. Review your plan, storage usage, page allowance, Sync access, and device at a glance with storage-style quota meters, then manage published pages, open the account Sync tab, upgrade, or refresh on demand. The Publish plan row wraps cleanly in narrow windows, and account links open directly from Settings without requiring an open Space.
- **Preferences**: The default location for new Spaces now lives in Settings > Preferences, alongside the other app preferences.
- **Versions**: Automatic background versions are no longer offered or created. Saved versions remain fully manual.

## Bug fixes

- **Publish on Windows**: Fixed a crash that made every Publish attempt from Eidos Lite on Windows exit with a stack-overflow code (`3221225725`). Publish now hashes the source without a 1 MiB stack buffer.
