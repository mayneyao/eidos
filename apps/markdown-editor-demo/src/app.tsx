import { useMemo, useRef, useState } from "react"
import {
  findUnsupportedMarkdownFeatures,
  MarkdownEditor,
} from "@eidos.space/markdown-editor"

import {
  GUARDED_MARKDOWN_SAMPLE,
  PORTABLE_MARKDOWN_SAMPLE,
} from "./sample-markdown"

type DemoSample = "portable" | "guarded"
type DemoLayout = "document" | "embedded"

function countWords(markdown: string): number {
  return markdown.trim() ? markdown.trim().split(/\s+/u).length : 0
}

export function App() {
  const [sample, setSample] = useState<DemoSample>("portable")
  const [markdown, setMarkdown] = useState(PORTABLE_MARKDOWN_SAMPLE)
  const [savedMarkdown, setSavedMarkdown] = useState(PORTABLE_MARKDOWN_SAMPLE)
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const [layout, setLayout] = useState<DemoLayout>("document")
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  )
  const sourceRef = useRef<HTMLTextAreaElement>(null)
  const unsupported = useMemo(
    () => findUnsupportedMarkdownFeatures(markdown),
    [markdown]
  )
  const dirty = markdown !== savedMarkdown

  const loadSample = (next: DemoSample) => {
    const value =
      next === "portable" ? PORTABLE_MARKDOWN_SAMPLE : GUARDED_MARKDOWN_SAMPLE
    setSample(next)
    setMarkdown(value)
    setSavedMarkdown(value)
    setCopyState("idle")
  }

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopyState("copied")
      window.setTimeout(() => setCopyState("idle"), 1_500)
    } catch {
      setCopyState("failed")
    }
  }

  return (
    <main className="demo-shell" data-theme={theme}>
      <header className="demo-header">
        <div className="demo-identity">
          <span className="demo-wordmark">EIDOS</span>
          <span className="demo-header-rule" aria-hidden="true" />
          <div>
            <h1>Markdown Editor Lab</h1>
            <p>Canonical Markdown · Lexical 0.49.0</p>
          </div>
        </div>
        <div className="demo-actions">
          <div
            className="demo-segmented"
            role="radiogroup"
            aria-label="Editor layout"
          >
            <button
              type="button"
              role="radio"
              aria-checked={layout === "document"}
              onClick={() => setLayout("document")}
            >
              Markdown file
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={layout === "embedded"}
              onClick={() => setLayout("embedded")}
            >
              Content field
            </button>
          </div>
          <div
            className="demo-segmented"
            role="radiogroup"
            aria-label="Demo sample"
          >
            <button
              type="button"
              role="radio"
              aria-checked={sample === "portable"}
              onClick={() => loadSample("portable")}
            >
              Portable
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={sample === "guarded"}
              onClick={() => loadSample("guarded")}
            >
              Fallback guard
            </button>
          </div>
          <button
            type="button"
            className="demo-quiet-button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? "Dark" : "Light"}
          </button>
        </div>
      </header>

      <section
        className="demo-workbench"
        aria-label="Markdown editor verification workbench"
      >
        <div className="demo-pane demo-canvas-pane">
          <header className="demo-pane-header">
            <div>
              <span className="demo-pane-index">01</span>
              <h2>WYSIWYG canvas</h2>
            </div>
            <span
              className="demo-status"
              data-status={unsupported.length === 0 ? "ready" : "guarded"}
            >
              {unsupported.length === 0
                ? "Round-trip ready"
                : `${unsupported.length} guarded ${unsupported.length === 1 ? "feature" : "features"}`}
            </span>
          </header>
          <div className="demo-editor-frame">
            <MarkdownEditor
              documentKey={sample}
              markdown={markdown}
              theme={theme}
              layout={layout}
              ariaLabel="Lexical Markdown demo editor"
              onMarkdownChange={setMarkdown}
              onSaveRequest={(nextMarkdown) => {
                setMarkdown(nextMarkdown)
                setSavedMarkdown(nextMarkdown)
              }}
              onRequestSourceMode={() => sourceRef.current?.focus()}
              onOpenExternalUrl={(url) => {
                window.open(url, "_blank", "noopener,noreferrer")
              }}
            />
          </div>
        </div>

        <div className="demo-pane demo-source-pane">
          <header className="demo-pane-header">
            <div>
              <span className="demo-pane-index">02</span>
              <h2>Canonical source</h2>
            </div>
            <button
              type="button"
              className="demo-copy-button"
              onClick={() => void copyMarkdown()}
            >
              {copyState === "copied"
                ? "Copied"
                : copyState === "failed"
                  ? "Copy failed"
                  : "Copy Markdown"}
            </button>
          </header>
          <textarea
            ref={sourceRef}
            className="demo-source"
            aria-label="Canonical Markdown source"
            spellCheck={false}
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            onKeyDown={(event) => {
              if (
                !event.altKey &&
                (event.metaKey || event.ctrlKey) &&
                event.key.toLowerCase() === "s"
              ) {
                event.preventDefault()
                setSavedMarkdown(markdown)
              }
            }}
          />
        </div>
      </section>

      <footer className="demo-statusbar">
        <span data-demo-save-state={dirty ? "dirty" : "saved"}>
          <i aria-hidden="true" />{" "}
          {dirty ? "Unsaved changes" : "Saved snapshot"}
        </span>
        <span>{markdown.length.toLocaleString()} characters</span>
        <span>{countWords(markdown).toLocaleString()} words</span>
        <span className="demo-statusbar-spacer" />
        <span>⌘S saves the in-memory snapshot</span>
      </footer>
    </main>
  )
}
