## What's new

### Recent files in the sidebar

Switch between **Tree** and **Recent** to browse your Space by folder or modification date. Recent groups files into **Today**, **Yesterday**, individual days from the past week, and **Earlier**, with previews to help you find your work.

The existing **Filter** menu now includes an option to hide files matched by `.gitignore`. The setting is shared between Tree and Recent.

### File and text search together

Press **Cmd/Ctrl+P** to search file and folder names, then switch to **Text** to search file contents in the same window. **Cmd/Ctrl+Shift+F** opens Text search directly. The window keeps a consistent height, including when there are no matches.

The sidebar's former full-text search has moved into this Files/Text search window. Sidebar search now quickly filters the directory tree by filename.

### More capabilities for plugins

Plugins can integrate with locally installed command-line programs after you approve native access. Supported plugins can offer executable and argument settings, and use atomic private storage to avoid overwriting concurrent updates. These capabilities are available to plugin developers; no agent plugin is bundled with this release.

## Improvements

- **Diff previews**: Switching files keeps the current preview visible until the next diff is ready. Longer loads show a small toolbar indicator instead of replacing the content with a loading screen.
- **Plugin appearance**: Plugin views receive the current theme before their first paint, reducing flashes when opening them.

## Bug fixes

- **Local plugin updates**: Opening a local plugin package keeps its review and update actions available, including when the plugin detail page is already open.
- **Plugin navigation**: Returning to the same plugin page preserves the current view and unsaved input.
- **Titlebar buttons**: Sidebar, Back, and Forward icons keep the same size when the sidebar opens or closes.
