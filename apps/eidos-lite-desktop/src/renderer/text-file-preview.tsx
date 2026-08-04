import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react"
import {
  CircleAlert,
  FileText,
  FileWarning,
  FolderOpen,
  LoaderCircle,
} from "lucide-react"

import type { TextFilePreviewResult } from "../shared/contracts"
import type { ResolvedAppearance } from "./app-appearance"
import { useEidosLiteI18n } from "./i18n"

let pierreTextEditorModule:
  | Promise<typeof import("./pierre-text-editor-surface")>
  | undefined
let LoadedPierreTextEditorSurface:
  | (typeof import("./pierre-text-editor-surface"))["default"]
  | undefined

async function loadPierreTextEditorSurface() {
  pierreTextEditorModule ??= import("./pierre-text-editor-surface")
  const module = await pierreTextEditorModule
  LoadedPierreTextEditorSurface = module.default
  return module
}

const LazyPierreTextEditorSurface = lazy(loadPierreTextEditorSurface)

function PierreTextEditorSurface(
  props: ComponentProps<typeof LazyPierreTextEditorSurface>
) {
  const Loaded = LoadedPierreTextEditorSurface
  return Loaded ? (
    <Loaded {...props} />
  ) : (
    <LazyPierreTextEditorSurface {...props} />
  )
}

type TextPreview = Extract<TextFilePreviewResult, { type: "text" }>
type SaveState = "saved" | "dirty" | "saving" | "conflict" | "error"

export interface TextFileDraft {
  content: string
  revision: string
}

export async function prepareTextFilePreview(
  preview: TextFilePreviewResult
): Promise<void> {
  if (preview.type === "text" && !preview.truncated) {
    await loadPierreTextEditorSurface()
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`
}

function encodingLabel(encoding: TextPreview["encoding"]): string {
  if (encoding === "utf-16le") return "UTF-16 LE"
  if (encoding === "utf-16be") return "UTF-16 BE"
  return "UTF-8"
}

function unavailableMessage(
  reason: Extract<TextFilePreviewResult, { type: "unavailable" }>["reason"],
  t: (message: string) => string
): string {
  if (reason === "symlink") {
    return t(
      "Linked files are not previewed, so the Space boundary stays explicit."
    )
  }
  if (reason === "not-file") {
    return t("This item is not a regular file and cannot be shown as text.")
  }
  return t(
    "This file does not look like UTF-8 or UTF-16 text. Eidos Lite left it closed instead of choosing another application."
  )
}

function EditableTextFile({
  preview,
  draft,
  theme,
  onSaved,
  onReload,
  onDraftChange,
}: {
  preview: TextPreview
  draft?: TextFileDraft
  theme: ResolvedAppearance
  onSaved(file: TextPreview): void
  onReload(preview: TextFilePreviewResult): void
  onDraftChange(relativePath: string, draft: TextFileDraft | null): void
}) {
  const { t } = useEidosLiteI18n()
  const initialContent = draft?.content ?? preview.content
  const [state, setState] = useState<SaveState>(
    initialContent === preview.content ? "saved" : "dirty"
  )
  const [error, setError] = useState<string | null>(null)
  const [editorContent, setEditorContent] = useState(initialContent)
  const [editorGeneration, setEditorGeneration] = useState(0)
  const draftRef = useRef(initialContent)
  const savedRef = useRef(preview.content)
  const revisionRef = useRef(draft?.revision ?? preview.revision)
  const conflictRef = useRef<TextFilePreviewResult | null>(null)
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const requestSave = useCallback((): Promise<void> => {
    const content = draftRef.current
    queueRef.current = queueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (
          conflictRef.current ||
          content === savedRef.current ||
          content !== draftRef.current
        ) {
          return
        }
        if (mountedRef.current) {
          setError(null)
          setState("saving")
        }
        try {
          const result = await window.eidosLite.saveTextFile({
            relativePath: preview.relativePath,
            content,
            expectedRevision: revisionRef.current,
          })
          if (result.status === "conflict") {
            conflictRef.current = result.current
            if (mountedRef.current) setState("conflict")
            return
          }

          savedRef.current = content
          revisionRef.current = result.file.revision
          onSaved(result.file)
          if (mountedRef.current) {
            if (draftRef.current === content) {
              onDraftChange(preview.relativePath, null)
              setState("saved")
            } else {
              onDraftChange(preview.relativePath, {
                content: draftRef.current,
                revision: result.file.revision,
              })
              setState("dirty")
            }
          }
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause)
          if (mountedRef.current) {
            setError(message)
            setState("error")
          }
        }
      })
    return queueRef.current
  }, [onDraftChange, onSaved, preview.relativePath])

  const handleChange = useCallback(
    (content: string) => {
      if (content === draftRef.current) return
      draftRef.current = content
      setError(null)
      const changed = content !== savedRef.current
      onDraftChange(
        preview.relativePath,
        changed ? { content, revision: revisionRef.current } : null
      )
      if (conflictRef.current) {
        setState("conflict")
        return
      }
      setState(changed ? "dirty" : "saved")
    },
    [onDraftChange, preview.relativePath]
  )

  const reloadFromDisk = useCallback(() => {
    const current = conflictRef.current
    if (!current) return
    if (current.type !== "text" || current.truncated) {
      onDraftChange(preview.relativePath, null)
      onReload(current)
      return
    }
    draftRef.current = current.content
    savedRef.current = current.content
    revisionRef.current = current.revision
    conflictRef.current = null
    setEditorContent(current.content)
    setEditorGeneration((generation) => generation + 1)
    setError(null)
    setState("saved")
    onDraftChange(preview.relativePath, null)
    onSaved(current)
  }, [onDraftChange, onReload, onSaved, preview.relativePath])

  return (
    <section
      className="text-file-preview text-file-editor"
      aria-label={t("Text editor for {path}", {
        path: preview.relativePath,
      })}
      data-text-file-preview={preview.relativePath}
      data-text-file-preview-state="text"
      data-text-file-preview-truncated="false"
      data-text-file-editor={preview.relativePath}
      onKeyDownCapture={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          !event.altKey &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault()
          void requestSave()
        }
      }}
    >
      {state === "conflict" || state === "error" ? (
        <div className="text-editor-save-issue" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>
            {error ? `${t("Save failed")}: ${error}` : t("Changed on disk")}
          </span>
          {state === "conflict" ? (
            <button
              type="button"
              className="text-editor-save-issue-action"
              onClick={reloadFromDisk}
            >
              {t("Reload from disk")}
            </button>
          ) : null}
        </div>
      ) : null}
      <Suspense
        fallback={
          <div className="text-preview-loading" role="status">
            <LoaderCircle className="spin" aria-hidden="true" />
            {t("Loading text editor…")}
          </div>
        }
      >
        <PierreTextEditorSurface
          key={`${preview.relativePath}:${editorGeneration}`}
          relativePath={preview.relativePath}
          content={editorContent}
          theme={theme}
          onChange={handleChange}
        />
      </Suspense>
    </section>
  )
}

export function TextFilePreview({
  preview,
  draft,
  theme,
  onReveal,
  onSaved,
  onReload,
  onDraftChange,
}: {
  preview: TextFilePreviewResult
  draft?: TextFileDraft
  theme: ResolvedAppearance
  onReveal(): void
  onSaved(file: TextPreview): void
  onReload(preview: TextFilePreviewResult): void
  onDraftChange(relativePath: string, draft: TextFileDraft | null): void
}) {
  const { t } = useEidosLiteI18n()
  if (preview.type === "unavailable") {
    return (
      <section
        className="editor-empty text-preview-unavailable"
        aria-labelledby="text-preview-unavailable-title"
        data-text-file-preview={preview.relativePath}
        data-text-file-preview-state={preview.reason}
      >
        <FileWarning aria-hidden="true" />
        <h2 id="text-preview-unavailable-title">{t("Preview unavailable")}</h2>
        <p>{unavailableMessage(preview.reason, t)}</p>
        <button
          type="button"
          className="editor-empty-action text-preview-reveal"
          onClick={onReveal}
        >
          <FolderOpen /> {t("Reveal in Finder")}
        </button>
      </section>
    )
  }

  if (!preview.truncated) {
    return (
      <EditableTextFile
        key={preview.relativePath}
        preview={preview}
        draft={draft}
        theme={theme}
        onSaved={onSaved}
        onReload={onReload}
        onDraftChange={onDraftChange}
      />
    )
  }

  return (
    <section
      className="text-file-preview"
      aria-label={t("Read-only preview of {path}", {
        path: preview.relativePath,
      })}
      data-text-file-preview={preview.relativePath}
      data-text-file-preview-state="text"
      data-text-file-preview-truncated="true"
    >
      <header className="text-preview-meta">
        <span className="text-preview-readonly">
          <FileText aria-hidden="true" /> {t("Read-only")}
        </span>
        <span>{encodingLabel(preview.encoding)}</span>
        <span>{formatBytes(preview.size)}</span>
      </header>
      {preview.content ? (
        <pre
          tabIndex={0}
          aria-label={t("Contents of {path}", { path: preview.relativePath })}
        >
          <code>{preview.content}</code>
        </pre>
      ) : (
        <div className="text-preview-empty">
          <FileText aria-hidden="true" />
          <span>{t("Empty file")}</span>
        </div>
      )}
      <footer>
        {t("Showing the first 2 MB. The file remains unchanged on disk.")}
      </footer>
    </section>
  )
}
