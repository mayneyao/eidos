import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
} from "react"
import {
  CircleAlert,
  Code2,
  Eye,
  FileText,
  FileWarning,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react"

import type {
  HtmlPreviewBounds,
  TextFilePreviewResult,
} from "../shared/contracts"
import { fileManagerMessage } from "../shared/platform-copy"
import type { ResolvedAppearance } from "./app-appearance"
import { useEidosLiteI18n } from "./i18n"
import { renderSafeMarkdown } from "./markdown-preview"
import type PierreTextEditorSurfaceImplementation from "./pierre-text-editor-surface"

const useRendererLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect

let pierreTextEditorModule:
  | Promise<{ default: typeof PierreTextEditorSurfaceImplementation }>
  | undefined
let LoadedPierreTextEditorSurface:
  | typeof PierreTextEditorSurfaceImplementation
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
type TextSurfacePreview = Exclude<TextFilePreviewResult, { type: "media" }>
type SaveState = "saved" | "dirty" | "saving" | "conflict" | "error"

export interface TextFileDraft {
  content: string
  revision: string
}

export async function prepareTextFilePreview(
  preview: TextFilePreviewResult
): Promise<void> {
  if (
    preview.type === "text" &&
    !preview.truncated &&
    !preview.browserPreview
  ) {
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
  autoFocus = false,
  onSaved,
  onReload,
  onDraftChange,
}: {
  preview: TextPreview
  draft?: TextFileDraft
  theme: ResolvedAppearance
  autoFocus?: boolean
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
          autoFocus={autoFocus}
          onChange={handleChange}
        />
      </Suspense>
    </section>
  )
}

type BrowserTextPreview = TextPreview & {
  browserPreview: NonNullable<TextPreview["browserPreview"]>
}

function previewBounds(element: HTMLElement): HtmlPreviewBounds | null {
  const rectangle = element.getBoundingClientRect()
  if (rectangle.width < 1 || rectangle.height < 1) return null
  return {
    x: rectangle.left,
    y: rectangle.top,
    width: rectangle.width,
    height: rectangle.height,
  }
}

function HtmlPreviewSurface({
  previewId,
  url,
  visible,
}: {
  previewId: string
  url: string
  visible: boolean
}) {
  const { t } = useEidosLiteI18n()
  const hostRef = useRef<HTMLDivElement>(null)
  const visibleRef = useRef(visible)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    visibleRef.current = visible
  }, [visible])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let active = true
    let animationFrame = 0

    const syncLayout = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => {
        const bounds = previewBounds(host)
        if (!bounds || !active) return
        void window.eidosLite
          .layoutHtmlPreview({
            previewId,
            bounds,
            visible: visibleRef.current,
          })
          .catch((cause) => {
            if (!active) return
            setState("error")
            setError(cause instanceof Error ? cause.message : String(cause))
          })
      })
    }
    const bounds = previewBounds(host)
    if (!bounds) return
    const observer = new ResizeObserver(syncLayout)
    observer.observe(host)
    window.addEventListener("resize", syncLayout)
    window.addEventListener("scroll", syncLayout, true)
    setState("loading")
    setError(null)
    void window.eidosLite
      .openHtmlPreview({
        previewId,
        url,
        bounds,
        visible: visibleRef.current,
      })
      .then(() => {
        if (active) setState("ready")
      })
      .catch((cause) => {
        if (!active) return
        setState("error")
        setError(cause instanceof Error ? cause.message : String(cause))
      })

    return () => {
      active = false
      observer.disconnect()
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener("resize", syncLayout)
      window.removeEventListener("scroll", syncLayout, true)
      void window.eidosLite.closeHtmlPreview(previewId)
    }
  }, [previewId, url])

  useRendererLayoutEffect(() => {
    const host = hostRef.current
    const bounds = host ? previewBounds(host) : null
    if (!bounds) return
    void window.eidosLite.layoutHtmlPreview({ previewId, bounds, visible })
  }, [previewId, visible])

  return (
    <div
      ref={hostRef}
      className="html-preview-native-host"
      data-html-preview-state={state}
    >
      {state === "loading" ? (
        <div className="text-preview-loading" role="status">
          <LoaderCircle className="spin" aria-hidden="true" />
          {t("Loading HTML preview…")}
        </div>
      ) : state === "error" ? (
        <div className="html-preview-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error ?? t("Could not load HTML preview")}</span>
        </div>
      ) : null}
    </div>
  )
}

function MarkdownPreview({ preview }: { preview: BrowserTextPreview }) {
  const { t } = useEidosLiteI18n()
  const document = useMemo(
    () => renderSafeMarkdown(preview.content),
    [preview.content]
  )
  const handleClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
      "a[data-markdown-external='true']"
    )
    if (!anchor) return
    event.preventDefault()
    void window.eidosLite.openExternalUrl(anchor.href)
  }, [])

  return (
    <div className="markdown-preview-scroll">
      <article
        className="markdown-document"
        aria-label={t("Markdown preview of {path}", {
          path: preview.relativePath,
        })}
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: document }}
      />
    </div>
  )
}

function DocumentFilePreview({
  preview,
  draft,
  theme,
  platform,
  nativePreviewSuppressed,
  onReveal,
  onSaved,
  onReload,
  onDraftChange,
}: {
  preview: BrowserTextPreview
  draft?: TextFileDraft
  theme: ResolvedAppearance
  platform: string
  nativePreviewSuppressed: boolean
  onReveal(): void
  onSaved(file: TextPreview): void
  onReload(preview: TextFilePreviewResult): void
  onDraftChange(relativePath: string, draft: TextFileDraft | null): void
}) {
  const { t } = useEidosLiteI18n()
  const [mode, setMode] = useState<"preview" | "source">("preview")
  const reactId = useId()
  const previewId = useMemo(
    () => `html-preview-${reactId.replace(/[^\w:-]/gu, "")}`,
    [reactId]
  )
  const hasUnsavedChanges = Boolean(draft && draft.content !== preview.content)
  const kindLabel = preview.browserPreview.kind === "html" ? "HTML" : "Markdown"
  const previewLabel = t("{kind} preview of {path}", {
    kind: kindLabel,
    path: preview.relativePath,
  })
  const htmlPreview =
    preview.browserPreview.kind === "html" ? preview.browserPreview : null

  return (
    <section
      className="document-file-preview"
      aria-label={previewLabel}
      data-document-file-preview={preview.relativePath}
      data-document-file-preview-kind={preview.browserPreview.kind}
      data-document-file-preview-mode={mode}
    >
      <header className="document-preview-toolbar">
        <div
          className="document-preview-mode"
          role="tablist"
          aria-label={t("Document view mode")}
        >
          <button
            type="button"
            role="tab"
            data-document-preview-mode="preview"
            aria-selected={mode === "preview"}
            className="document-preview-mode-button"
            onClick={() => setMode("preview")}
          >
            <Eye aria-hidden="true" /> {t("Preview")}
          </button>
          <button
            type="button"
            role="tab"
            data-document-preview-mode="source"
            aria-selected={mode === "source"}
            className="document-preview-mode-button"
            onClick={() => setMode("source")}
          >
            <Code2 aria-hidden="true" /> {t("Source")}
          </button>
        </div>
        <span className="document-preview-security">
          <ShieldCheck aria-hidden="true" /> {t("Sandboxed")}
        </span>
        {hasUnsavedChanges ? (
          <span className="document-preview-unsaved">
            {t("Preview shows the saved file")}
          </span>
        ) : null}
        <div className="document-preview-actions">
          {mode === "preview" && htmlPreview ? (
            <button
              type="button"
              className="document-preview-icon-button"
              aria-label={t("Refresh document preview")}
              title={t("Refresh document preview")}
              onClick={() => void window.eidosLite.reloadHtmlPreview(previewId)}
            >
              <RefreshCw aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className="editor-empty-action media-preview-reveal"
            onClick={onReveal}
          >
            <FolderOpen aria-hidden="true" /> {t(fileManagerMessage(platform))}
          </button>
        </div>
      </header>
      <div className="document-preview-body">
        {mode === "preview" ? (
          htmlPreview ? (
            <HtmlPreviewSurface
              previewId={previewId}
              url={htmlPreview.url}
              visible={!nativePreviewSuppressed}
            />
          ) : (
            <MarkdownPreview preview={preview} />
          )
        ) : (
          <EditableTextFile
            key={preview.relativePath}
            preview={preview}
            draft={draft}
            theme={theme}
            autoFocus
            onSaved={onSaved}
            onReload={onReload}
            onDraftChange={onDraftChange}
          />
        )}
      </div>
    </section>
  )
}

export function TextFilePreview({
  preview,
  draft,
  theme,
  platform,
  nativePreviewSuppressed = false,
  onReveal,
  onSaved,
  onReload,
  onDraftChange,
}: {
  preview: TextSurfacePreview
  draft?: TextFileDraft
  theme: ResolvedAppearance
  platform: string
  nativePreviewSuppressed?: boolean
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
          <FolderOpen /> {t(fileManagerMessage(platform))}
        </button>
      </section>
    )
  }

  if (!preview.truncated) {
    if (preview.browserPreview) {
      return (
        <DocumentFilePreview
          key={preview.relativePath}
          preview={preview as BrowserTextPreview}
          draft={draft}
          theme={theme}
          platform={platform}
          nativePreviewSuppressed={nativePreviewSuppressed}
          onReveal={onReveal}
          onSaved={onSaved}
          onReload={onReload}
          onDraftChange={onDraftChange}
        />
      )
    }
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
