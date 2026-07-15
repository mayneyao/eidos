# Markdown Task Board

This UI extension opens `*.tasks.md` files as a two-column task board while
keeping Markdown as the source of truth.

```md
# Website launch

- [ ] Finish the landing page
- [x] Choose a domain
```

## Try it in Eidos Desktop

1. Copy this directory to
   `<space>/.eidos/extensions/example.markdown-task-board/`.
2. Open **Settings → Extensions**, refresh, and review the exact source digest.
3. Trust the source, grant read and write access to `**/*.tasks.md`, then enable
   the extension.
4. Create `website.tasks.md` in the Space and open it. Because the editor has
   `priority: "default"`, Eidos opens the Task Board automatically.
5. Use the file context menu and select **Open with Eidos** whenever you want to
   inspect or edit the raw Markdown.

Toggling a card requests a one-character text edit for the checkbox marker.
The host owns revisions, undo/redo, autosave, external-change conflicts, and
the final filesystem write. The surface has no direct filesystem or network
access.
