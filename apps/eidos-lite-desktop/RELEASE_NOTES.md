## What's new

### Browse a folder your way

Right-click a folder and choose **Show this folder** to focus the Explorer on that directory. Sort files by name, modification time, or file type, with folders kept first and your sorting preference remembered.

### Customize your sidebar

Pin and reorder plugin pages to keep your frequent destinations close at hand. Plugins can also provide a complete file browser: choose one from the plugin manager, and return to the built-in Explorer at any time.

### Install plugins by opening their packages

Double-click an `.eidos-plugin` package to review its identity and permissions, then install or update it. Updates preserve each Space's enablement; newly installed plugins remain disabled until you enable them.

## Improvements

- **Inherited file metadata configuration**: Creating `files.eidos` in a subfolder copies the nearest parent configuration's custom fields, options, display settings, and property mappings. Later parent edits do not overwrite existing child configurations.
- **Plugin development**: Plugin API 3.1 adds native file property read/write access and custom sidebar explorers. Existing API 3.0 plugins remain supported.

## Bug fixes

- **Record opening preference**: Your choice of opening records in a side panel or as a full page is remembered after restarting.
- **Cell editor alignment**: Editors for newly appended records stay aligned when the layout changes, preserving the current input and focus.
