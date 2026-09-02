import { useState } from "react"
import { MarkdownEditor } from "@eidos.space/markdown-editor"

import { PLAYGROUND_MARKDOWN } from "./sample-markdown"

export function App() {
  const [markdown, setMarkdown] = useState(PLAYGROUND_MARKDOWN)
  const [view, setView] = useState<"editor" | "source">("editor")
  const [readOnly, setReadOnly] = useState(false)

  return (
    <main className="playground-shell">
      <header className="playground-header">
        <h1>Markdown Editor Playground</h1>
        <div className="playground-actions">
          <label className="playground-switch">
            <span>Read only</span>
            <input
              type="checkbox"
              role="switch"
              checked={readOnly}
              onChange={(event) => setReadOnly(event.target.checked)}
            />
            <span className="playground-switch-track" aria-hidden="true" />
          </label>
          <button
            type="button"
            aria-pressed={view === "source"}
            onClick={() => setView(view === "editor" ? "source" : "editor")}
          >
            {view === "editor" ? "View source" : "View editor"}
          </button>
        </div>
      </header>
      <div className="playground-content">
        {view === "editor" ? (
          <MarkdownEditor
            documentKey="playground"
            markdown={markdown}
            ariaLabel="Markdown playground editor"
            readOnly={readOnly}
            onMarkdownChange={setMarkdown}
            onOpenExternalUrl={(url) => {
              window.open(url, "_blank", "noopener,noreferrer")
            }}
          />
        ) : (
          <textarea
            className="playground-source"
            aria-label="Markdown source"
            spellCheck={false}
            readOnly={readOnly}
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
          />
        )}
      </div>
    </main>
  )
}
