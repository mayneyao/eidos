## Plugin SDK and Tools 0.5.0-rc.1

This release candidate targets executable Plugin API 3.0.0. Install matching
candidate hosts before running generated plugins.

- Build page and file views with resource metadata in `binding` and operations
  under `capabilities`.
- Compose `eidos/schema`, `eidos/table` and `eidos/config` capabilities, with
  shared credentialed connections and lifecycle-bound access.
- Use the consistent `readContext`, `readRows`, `setViewConfig`, `watch`,
  `settings.set`, `storage.delete`, `connections.isConfigured` and
  `task.declareOutputs` APIs. Removed names have no compatibility aliases.
- Generate updated document, Eidos, table, action and page starters. Standalone
  themes retain their independent Plugin API 1.6.0 contract.

Existing executable plugins require source migration. Follow the repository's
[migration guide](https://github.com/mayneyao/eidos/blob/dev/docs/migrations/eidos-plugins.md).
