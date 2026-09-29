## Improvements

- **Plugin development**: Plugin API 3 organizes views as pages or files, with file capabilities for document editing and Eidos schema, table, and configuration access. Plugins use a consistent capability interface with lifecycle-bound handles.

**Plugin upgrade required:** executable plugins must declare `requires.pluginApi: "3.0.0"` and use the new SDK interface. Update installed executable plugins to their API 3 releases after upgrading Lite. Plugin developers should follow the [migration guide](https://github.com/mayneyao/eidos/blob/dev/docs/migrations/eidos-plugins.md). Pure API 1.6 theme plugins remain supported.

## Bug fixes

- **File creation time**: File metadata shows the actual creation time when the filesystem provides it, instead of repeating the last modification time. Filesystems without creation timestamps leave this value empty.
- **Restored file deletions**: After restoring a history snapshot that deletes a SQLite file, refreshing history, staging, and syncing preserve the deletion. Cached database state no longer makes the deleted file reappear.
