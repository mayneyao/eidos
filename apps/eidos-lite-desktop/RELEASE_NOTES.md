## What's new

### Collapsible headings and section reordering

Headings now have a fold control. Collapse a heading to hide its section or expand it again, and fold or unfold every heading at once. Drag a heading's gutter handle to move the whole section — the heading and its content — in one step. New document shortcuts: toggle fold (`⌘/Ctrl+Alt+[`), fold all (`⌘/Ctrl+Alt+0`), and unfold all (`⌘/Ctrl+Alt+Shift+0`). All three can be rebound in Settings.

### Insert callout blocks

Add a callout from the block insertion menu. A new callout starts as a Note with a capitalized title, and you can change its type or title directly. Callouts render with the same styling in the editor and in published documents.

### Resize images by dragging

Hover or focus a standalone image to reveal left and right resize handles. Drag to resize proportionally within the content column, or press Left/Right (8 px, or 32 px with Shift). The width is saved using the existing `![alt|width](url)` syntax, and a completed drag is a single undo step. Read-only documents and inline images keep their current behavior.

### Configure document shortcuts and switch Markdown modes faster

Keyboard Shortcuts settings now include a Document group — fold headings, move list items and blocks, and apply bold or italic — alongside the existing workspace and table commands. Rebind, clear, or restore any shortcut, with inline warnings for conflicts and reserved system bindings. A new `⌘/Ctrl+2` shortcut switches between rich text and Markdown source editing, and its binding is shown in the Open with menu.

## Improvements

- **Published pages**: Published documents now use a static HTML renderer that shares the editor's syntax for math, callouts, properties, highlights, and image sizes. The stylesheet is bundled with the page, so published content needs no editor runtime and no separate stylesheet request.

## Bug fixes

- **Sync**: Signing out and back in, or switching accounts, no longer leaves Sync stuck; authentication is recovered automatically.
- **Navigation**: Moving between views, files, and records now uses one navigation history, so Back and Forward restore the expected record.
- **Quick Open**: Quick Open is now a modal dialog, keeping keyboard focus inside it while it is open.
- **Version history**: Selecting a version no longer reloads its details, so the panel stays responsive.
- **Interface**: Corrected explorer context-menu sizing and typography, and aligned Settings sections and application branding.
- **Fields**: System field labels are aligned in the fields popover.
- **Markdown editor**: The editor focuses the start of the document when it opens, and nested lists no longer show extra vertical spacing.
