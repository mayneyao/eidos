## What's new

### Copy images from the attachment preview

The attachment preview for image files now includes a **Copy image** button. Copy the original image to the clipboard and paste it into another app. The action row keeps a stable width while the button cycles through **Copy image**, **Copied**, and **Copy failed**, and **Open** and **Download** use short labels with the file name kept in their accessible names.

## Improvements

- **Published pages**: Published documents now highlight fenced code blocks with the editor's semantic token colors in both light and dark themes, so shared pages match the editor.
- **Headings**: Fold-all now collapses the dominant heading level — the shallowest level that repeats — and leaves a lone title heading expanded, so folding a document preserves its structure.
- **Sync**: Read-only or expired Sync access now shows a clear warning in the Sync inspector and panel, reports **Sync writes are paused** instead of a misleading upload count, and promotes **Manage Sync access** so renewal is the obvious next step.

## Bug fixes

- **Windows/Linux titlebar**: File titlebar actions are sized from the OS caption metrics, keeping the row aligned at fractional display scaling such as Windows 125%.
- **Interface zoom**: The saved interface scale is re-applied after a window is resized, moved, maximized, or restored instead of requiring a manual reload.
- **Space Explorer**: Shift/Command/Control-clicking now extends the tree selection instead of also opening the clicked file.
- **Markdown editor**: The block insert gutter stays inside the editor's visible bounds instead of drifting over the titlebar and side panels.
- **Changes**: Expanded tables in the flat changes list align with the parent file's icon and label, and the tree/list toggle lines up with the list edge.
