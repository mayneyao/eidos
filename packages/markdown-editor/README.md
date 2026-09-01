# @eidos.space/markdown-editor

The shared Lexical-based WYSIWYG Markdown editor used by Eidos hosts.

Markdown remains the canonical persisted representation. This package owns the
Lexical editor, Markdown import/export, editor UI, and compatibility checks. It
does not own source editing, persistence, file-system access, or Eidos File
mutations.

The current Markdown contract includes headings, quotes, lists, checklists,
links, fenced code, horizontal rules, inline formatting, and GFM tables. The
editor reports syntax it cannot preserve so the host can fall back to its
source editor without rewriting the document.

Formatting controls are shown as a contextual toolbar when text is selected;
the editor does not reserve permanent document space for a toolbar.

Use `layout="document"` (the default) for a standalone Markdown file with
reading margins. Use `layout="embedded"` for a Content field whose host already
owns the content width. Both layouts inherit the host's editorial font so the
WYSIWYG canvas keeps the same typography as the corresponding Markdown preview.
