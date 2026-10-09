## Plugin SDK and Tools 0.7.0

This release adds optional file hooks for Plugin API 3.3.0. Existing executable
plugins and standalone themes retain their declared requirements.

- Declare isolated hooks that run after local file saves and renames. Use
  scoped document reads, text updates and renames without exposing filesystem
  handles to guest code.
- Add a plugin-specific description to the package manifest.
- Generate, check and pack projects with the matching 0.7.0 SDK and tools.
  Existing document, Eidos, table, action, page and theme starters remain available.

File hooks require a host advertising Plugin API 3.3.0 and the corresponding
capability. Eidos Lite 0.23.0 supports them. CLI Serve does not support file
hooks and rejects packages requiring that capability.

See the [file hooks guide](https://docs.eidos.space/plugins/api/#run-after-local-file-changes) for
declarations, permissions and host behavior.
