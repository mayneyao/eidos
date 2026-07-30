import { FileText, FileWarning, FolderOpen } from "lucide-react"

import type { TextFilePreviewResult } from "../shared/contracts"

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`
}

function encodingLabel(
  encoding: Extract<TextFilePreviewResult, { type: "text" }>["encoding"]
): string {
  if (encoding === "utf-16le") return "UTF-16 LE"
  if (encoding === "utf-16be") return "UTF-16 BE"
  return "UTF-8"
}

function unavailableMessage(
  reason: Extract<TextFilePreviewResult, { type: "unavailable" }>["reason"]
): string {
  if (reason === "symlink") {
    return "Linked files are not previewed, so the Space boundary stays explicit."
  }
  if (reason === "not-file") {
    return "This item is not a regular file and cannot be shown as text."
  }
  return "This file does not look like UTF-8 or UTF-16 text. Eidos Lite left it closed instead of choosing another application."
}

export function TextFilePreview({
  preview,
  onReveal,
}: {
  preview: TextFilePreviewResult
  onReveal(): void
}) {
  if (preview.type === "unavailable") {
    return (
      <section
        className="editor-empty text-preview-unavailable"
        aria-labelledby="text-preview-unavailable-title"
        data-text-file-preview={preview.relativePath}
        data-text-file-preview-state={preview.reason}
      >
        <FileWarning aria-hidden="true" />
        <h2 id="text-preview-unavailable-title">Preview unavailable</h2>
        <p>{unavailableMessage(preview.reason)}</p>
        <button
          type="button"
          className="editor-empty-action text-preview-reveal"
          onClick={onReveal}
        >
          <FolderOpen /> Reveal in Finder
        </button>
      </section>
    )
  }

  const lineCount = preview.content
    ? preview.content.split(/\r\n|\r|\n/).length
    : 0
  return (
    <section
      className="text-file-preview"
      aria-label={`Read-only preview of ${preview.relativePath}`}
      data-text-file-preview={preview.relativePath}
      data-text-file-preview-state="text"
      data-text-file-preview-truncated={preview.truncated ? "true" : "false"}
    >
      <header className="text-preview-meta">
        <span className="text-preview-readonly">
          <FileText aria-hidden="true" /> Read-only
        </span>
        <span>{encodingLabel(preview.encoding)}</span>
        <span>{formatBytes(preview.size)}</span>
        <span>
          {lineCount.toLocaleString()} {lineCount === 1 ? "line" : "lines"}
        </span>
      </header>
      {preview.content ? (
        <pre tabIndex={0} aria-label={`Contents of ${preview.relativePath}`}>
          <code>{preview.content}</code>
        </pre>
      ) : (
        <div className="text-preview-empty">
          <FileText aria-hidden="true" />
          <span>Empty file</span>
        </div>
      )}
      {preview.truncated ? (
        <footer>
          Showing the first 2 MB. The file remains unchanged on disk.
        </footer>
      ) : null}
    </section>
  )
}
