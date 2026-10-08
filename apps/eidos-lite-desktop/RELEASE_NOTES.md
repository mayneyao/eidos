## What's new

### Connect your phone over the local network

Pair Eidos for Android or iOS with Eidos Lite to download and synchronize Spaces over the same local network. Each device keeps an offline copy, and local-network sync requires no cloud account. Review incoming pairing requests on your computer, follow transfers by device, and resume sharing after restarting Lite. Conflicting edits remain available for review on Desktop.

### Compose files and saved views

Plugin API 3.2 lets plugins combine saved table views and ordinary files in a single read-only presentation, offer their own file templates in New File, and export generated files through the host's save dialog. Plugin file editors participate in the usual Save command, including Command-S or Ctrl-S. Existing API 3.0 and 3.1 plugins remain supported.

## Improvements

- **Publish file views**: Share ordinary files as web pages rendered by a plugin file View, such as a GPX route displayed on a map. Publishing captures the file and plugin together so visitors see the published version. Requires Pro.

- **New File**: Choose the file type directly and keep control of the filename. Text files can have no extension, including dotfiles such as `.graftignore`.
- **Device transfers**: Sync displays device-specific activity with localized progress labels.

## Bug fixes

- **Markdown task lists**: Empty checked and unchecked tasks retain their state after saving and reopening, including nested and loose lists.
- **Local history**: An unavailable history service displays an actionable error instead of an empty panel. The bundled Graft dependency and version checks are aligned.
- **Space refresh**: Creating a checkpoint or reading merge status no longer interrupts an explicit refresh with a cancellation error.
- **Editor focus**: Returning focus to Markdown content restores its caret so keyboard editing can continue.
