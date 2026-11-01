## Bug fixes

- **Version history and Sync**: Fixed a snapshot hash error that could block syncing or downloading a Space after restoring an earlier database version or editing a downloaded Space. These checkpoints now sync correctly to other devices.

Existing checkpoints affected by this error are not rewritten automatically. Keep the original Space and its history for recovery.
