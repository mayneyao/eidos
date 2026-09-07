## What's new

### Find text across your Space

Press **Cmd/Ctrl+Shift+F** to search saved text without leaving the sidebar. Results are grouped by file with highlighted matches, case sensitivity, whole-word matching, and regular expressions. **Cmd/Ctrl+F** opens a compact Find bar inside the current document to highlight and navigate matches in real time.

### Recover one document from History

The Versions sidebar now lets you switch between all saved versions and the current document's history. Sparse history pages load automatically within a bounded scan, and selected versions open in the main diff area. Restore a text version or save either side as a safe copy from one compact toolbar. Before restoring, Lite keeps sibling copies of the current file and any unsaved draft.

### Complete note links and unified Markdown editing

Autocompletion now supports note titles, wikilinks, and block references with seamless navigation across documents. Source and rich text modes share unified link and block handling without losing untouched formatting.

## Improvements

- **Record Properties**: Expanded record titles occupy a consistent single line with aligned property labels. Hover over read-only fields to copy complete multiline values and metadata.
- **Draft Protection**: Closing a document or quitting checks outstanding text drafts and prompts to save, discard, or cancel. External disk changes keep the draft available for recovery.
- **Quick Open**: Excludes dependency trees and common build output so large repositories remain responsive, reporting indexing failures gracefully instead of empty results.
- **Explorer Navigation**: Expanding folders in the sidebar explorer no longer unexpectedly scrolls back to the open document.

## Bug fixes

- **Runtime Cleanup**: Finalize invalidated runtime cleanup reliably after close errors to prevent lingering process handles.
- **Session Concurrency**: Register newly created file sessions immediately in SpaceSession to avoid concurrent open collisions.
- **Diff View**: Keep the diff close button positioned stably beside the file title.
- **Markdown Rendering**: Preserve HTML image presentation and expand embedded block selection canvas.

No file-format migration is required.
