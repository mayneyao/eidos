import {
  DEFAULT_MARKDOWN_SHORTCUTS,
  markdownShortcutLabels,
  type MarkdownShortcutDefinition,
  type MarkdownShortcutId,
  type MarkdownShortcutScope,
  type ShortcutDisplayPlatform,
} from "@eidos.space/markdown"
import { useMemo, useRef } from "react"

const SCOPE_LABELS: Record<MarkdownShortcutScope, string> = {
  "block-handle": "Block",
  composer: "Composer",
  document: "Document",
  editor: "Editor",
  "list-item": "List item",
  menu: "Menu",
  overlay: "Overlay",
  selection: "Selection",
}

type ShortcutEntry = [MarkdownShortcutId, MarkdownShortcutDefinition]

function displayPlatform(): ShortcutDisplayPlatform {
  return /Mac|iPhone|iPad|iPod/u.test(navigator.platform) ? "mac" : "other"
}

export function ShortcutReference() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const platform = useMemo(displayPlatform, [])
  const shortcuts = Object.entries(
    DEFAULT_MARKDOWN_SHORTCUTS
  ) as ShortcutEntry[]

  return (
    <>
      <button
        className="playground-shortcuts-trigger"
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        Shortcuts
      </button>
      <dialog
        ref={dialogRef}
        className="playground-shortcuts-dialog"
        aria-labelledby="playground-shortcuts-title"
        aria-describedby="playground-shortcuts-description"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
      >
        <section className="playground-shortcuts-panel">
          <header className="playground-shortcuts-heading">
            <div>
              <h2 id="playground-shortcuts-title">Keyboard shortcuts</h2>
              <p id="playground-shortcuts-description">
                Default Markdown editor bindings
              </p>
            </div>
            <form method="dialog">
              <button
                className="playground-shortcuts-close"
                type="submit"
                aria-label="Close keyboard shortcuts"
                autoFocus
              >
                <span aria-hidden="true">×</span>
              </button>
            </form>
          </header>
          <ul className="playground-shortcuts-list">
            {shortcuts.map(([id, definition]) => (
              <li
                key={id}
                className="playground-shortcut-row"
                data-shortcut-id={id}
              >
                <div className="playground-shortcut-copy">
                  <span className="playground-shortcut-description">
                    {definition.description}
                  </span>
                  <span className="playground-shortcut-meta">
                    {SCOPE_LABELS[definition.scope]}
                    <code>{id}</code>
                  </span>
                </div>
                <span className="playground-shortcut-bindings">
                  {markdownShortcutLabels(id, platform).map((label) => (
                    <kbd key={label}>{label}</kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </dialog>
    </>
  )
}
