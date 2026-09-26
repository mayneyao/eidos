## What's new

### Organize local files in a table

Choose **Eidos** in New File and enable **File Metadata Management** to browse the containing folder and its subfolders as a table. Tag and rate files, add custom fields, filter the list, and preview attachments without importing the original files. Renaming a field preserves its values.

Values are stored on the physical files, outside the `.eidos` database. Deleting a custom field clears its corresponding attributes. Backups and transfers must preserve extended attributes or alternate data streams; do not rely on copying the `.eidos` file or on Sync alone to preserve these values.

### Build plugins for ordinary files

Plugin API 2.0 adds a unified filesystem interface for permitted file access, media viewers, and companion files such as subtitles. Plugins can respond to changes across file types and provide file-specific actions.

**Plugin upgrade required:** executable plugins must migrate to `ctx.fs` and declare `requires.pluginApi: "2.0.0"`. Older executable plugins will not run until updated. Pure API 1.6 theme plugins remain supported.

## Improvements

- **Creation menu**: New File, New Folder, and Import share the **+** menu beside search. The simpler New File dialog keeps Eidos and Text choices beside its title without changing height when switching.
- **Plugin browsing**: Marketplace entries can show screenshots before installation.

## Bug fixes

- **File tree**: Move nested files to the root by dropping them in the empty area. Moving files avoids unnecessary full-tree refreshes, and holding the scrollbar at the bottom no longer causes repeated jumping.
- **Terminal appearance**: Terminal colors and fonts follow theme plugins when switching between light and dark mode.
