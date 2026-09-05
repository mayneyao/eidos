## What's new

### Try experimental Obsidian Markdown compatibility

Settings now offers an explicit **Obsidian (Experimental)** Markdown profile.
It previews Vault links and embeds, callouts, block IDs, tags, comments, inline
footnotes, Obsidian image sizes, and richer YAML properties without changing
the default Eidos Markdown profile. Internal note and attachment resolution
stays inside the open Vault, while same-note headings and block references
scroll in place instead of navigating the application away.

This compatibility mode is incomplete and may change in later releases. It
does not read `.obsidian`, emulate Obsidian plugins or themes, maintain
backlinks, or rewrite links after a file rename. Keep important Vaults backed
up and switch back to Eidos Markdown if a document does not render as expected.

### Read complex lists without a source fallback

Lists containing multiple paragraphs or fenced code blocks now render as
structured content instead of turning the entire list into a Markdown source
panel. Single-column tables also render as tables. YAML properties display
lists and empty values more readably without replacing the original YAML.

### Edit selected blocks as one source range

Select consecutive blocks and press **E** to edit their original Markdown in
place. The source surface supports keyboard formatting, indentation, moving,
copying, deleting, undo, and redo, then commits as one undoable change. Pinned
frontmatter and footnote definitions remain outside incompatible block moves.

### Keep the sidebar update action stable

The sidebar update control now keeps its reserved space and alignment while
update state changes, avoiding layout shifts during routine navigation.

No migration is required. Obsidian compatibility remains an opt-in experimental
feature in this release.
