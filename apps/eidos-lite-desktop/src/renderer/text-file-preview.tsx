import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react"
import { createPortal } from "react-dom"
import {
  CircleAlert,
  FileText,
  FileWarning,
  FolderOpen,
  LoaderCircle,
} from "lucide-react"
import type { MarkdownEditorInternalLinkRequest } from "@eidos.space/markdown"
import type { TextFileNavigationTarget as MarkdownEditorNavigationTarget } from "./text-search-navigation"

import type {
  EidosLiteMarkdownCompatibilityProfile,
  EidosLiteMarkdownEditingMode,
  TextFilePreviewResult,
} from "../shared/contracts"
import type { EidosLiteKeyboardShortcuts } from "../shared/keyboard-shortcuts"
import { fileManagerMessage } from "../shared/platform-copy"
import type { ResolvedAppearance } from "./app-appearance"
import { useFileContentFocusRequest } from "./file-content-focus"
import { useEidosLiteI18n } from "./i18n"
import { workspaceShortcutLabel } from "./workspace-shortcuts"
import {
  MarkdownEditorSurface,
  prepareMarkdownEditorSurface,
} from "./markdown-editor-surface"
import { renderSafeMarkdown } from "./markdown-preview"
import { textDraftLifecycle } from "./text-draft-lifecycle"
import {
  acceptsTextFileSave,
  registerTextFileSaveTarget,
} from "./text-file-save-shortcut"

const useRendererLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect

type TextPreview = Extract<TextFilePreviewResult, { type: "text" }>
type TextSurfacePreview = Exclude<TextFilePreviewResult, { type: "media" }>
type SaveState = "saved" | "dirty" | "saving" | "conflict" | "error"

function saveFailureMessage(
  cause: unknown,
  t: (message: string) => string
): string {
  const message = cause instanceof Error ? cause.message : String(cause)
  if (/EACCES|EPERM|EROFS|permission denied|read-only/iu.test(message))
    return t(
      "Check write access to this file's folder and try again. Your draft is kept."
    )
  if (/ENOSPC|disk.*full/iu.test(message))
    return t(
      "The disk is full. Free some space and try again. Your draft is kept."
    )
  if (/2 MB/u.test(message)) return t("Edited text exceeds the 2 MB file limit")
  return t(
    "The file could not be saved. Your draft is kept. Try again or save a copy."
  )
}

export interface TextFileDraft {
  content: string
  revision: string
}

export async function prepareTextFilePreview(
  preview: TextFilePreviewResult,
  markdownFileEditingMode: EidosLiteMarkdownEditingMode = "source"
): Promise<void> {
  if (preview.type !== "text" || preview.truncated) return
  const editingMode =
    preview.browserPreview?.kind === "markdown"
      ? markdownFileEditingMode
      : "source"
  await prepareMarkdownEditorSurface(editingMode)
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
  platform,
  draft,
  theme,
  autoFocus = false,
  focusRequestToken = 0,
  editingMode = "source",
  markdownCompatibilityProfile = "eidos",
  navigationTarget,
  onOpenInternalLink,
  focusShortcutLabel,
  keyboardShortcuts,
  saveStatusTarget,
  onEditingModeChange,
  onSaved,
  onReload,
  onDraftChange,
}: {
  preview: TextPreview
  platform: string
  draft?: TextFileDraft
  theme: ResolvedAppearance
  autoFocus?: boolean
  focusRequestToken?: number
  editingMode?: EidosLiteMarkdownEditingMode
  markdownCompatibilityProfile?: EidosLiteMarkdownCompatibilityProfile
  navigationTarget?: MarkdownEditorNavigationTarget
  onOpenInternalLink?(
    sourceRelativePath: string,
    request: MarkdownEditorInternalLinkRequest
  ): void | Promise<void>
  focusShortcutLabel?: string
  keyboardShortcuts?: EidosLiteKeyboardShortcuts
  saveStatusTarget?: HTMLElement | null
  onEditingModeChange?(mode: EidosLiteMarkdownEditingMode): void
  onSaved(file: TextPreview): void
  onReload(preview: TextFilePreviewResult): void
  onDraftChange(relativePath: string, draft: TextFileDraft | null): void
}) {
  const { t } = useEidosLiteI18n()
  const initialContent = draft?.content ?? preview.content
  const initialConflict = Boolean(draft && draft.revision !== preview.revision)
  const [state, setState] = useState<SaveState>(
    initialConflict
      ? "conflict"
      : initialContent === preview.content
        ? "saved"
        : "dirty"
  )
  const [error, setError] = useState<string | null>(null)
  const [editorContent, setEditorContent] = useState(initialContent)
  const [editorGeneration, setEditorGeneration] = useState(0)
  const draftRef = useRef(initialContent)
  const savedRef = useRef(preview.content)
  const revisionRef = useRef(draft?.revision ?? preview.revision)
  const pathRef = useRef(preview.relativePath)
  const identityRef = useRef(preview.editorIdentity ?? preview.relativePath)
  pathRef.current = preview.relativePath
  const conflictRef = useRef<TextFilePreviewResult | null>(
    initialConflict ? preview : null
  )
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const mountedRef = useRef(true)
  const sectionRef = useRef<HTMLElement>(null)
  const saveRef = useRef<() => void>(() => undefined)
  useEffect(() => {
    const root = sectionRef.current
    if (root)
      return registerTextFileSaveTarget({
        root,
        platform,
        save: () => saveRef.current(),
      })
  }, [platform])

  useEffect(() => {
    if (!saveStatusTarget) return
    // The title control belongs to this editor even when the other pane was
    // used last. Register its actual DOM location as well as the editor body.
    return registerTextFileSaveTarget({
      root: saveStatusTarget,
      platform,
      save: () => saveRef.current(),
    })
  }, [platform, saveStatusTarget])

  useRendererLayoutEffect(() => {
    if (preview.revision !== revisionRef.current) {
      if (draft || draftRef.current !== savedRef.current) {
        // A Sync refresh can finish after the user starts typing. Preserve the
        // text and its old compare-and-swap revision, and expose the same
        // conflict recovery as a save against a changed file.
        conflictRef.current = preview
        setState("conflict")
        setError(null)
        return
      }
      savedRef.current = preview.content
      revisionRef.current = preview.revision
      conflictRef.current = null
    }
    const content = draft?.content ?? preview.content
    if (content === draftRef.current) return
    draftRef.current = content
    setEditorContent(content)
    setError(null)
    setState(
      conflictRef.current
        ? "conflict"
        : content === savedRef.current
          ? "saved"
          : "dirty"
    )
  }, [draft?.content, preview.content, preview.revision])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const requestSave = useCallback((): Promise<void> => {
    if (textDraftLifecycle.isLocked) return Promise.resolve()
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
            relativePath: pathRef.current,
            content,
            expectedRevision: revisionRef.current,
          })
          if (result.status === "conflict") {
            conflictRef.current = result.current
            if (mountedRef.current) setState("conflict")
            return
          }

          const previousPath = pathRef.current
          pathRef.current = result.file.relativePath
          savedRef.current = result.file.content
          revisionRef.current = result.file.revision
          if (previousPath !== result.file.relativePath)
            onDraftChange(previousPath, null)
          if (draftRef.current === content) {
            draftRef.current = result.file.content
            setEditorContent(result.file.content)
            onDraftChange(result.file.relativePath, null)
          } else {
            onDraftChange(result.file.relativePath, {
              content: draftRef.current,
              revision: result.file.revision,
            })
          }
          onSaved(result.file)
          if (mountedRef.current) {
            if (draftRef.current === savedRef.current) {
              setState("saved")
            } else {
              setState("dirty")
            }
          }
        } catch (cause) {
          if (mountedRef.current) {
            setError(saveFailureMessage(cause, t))
            setState("error")
          }
        }
      })
    return textDraftLifecycle.track(queueRef.current)
  }, [onDraftChange, onSaved, preview.relativePath, t])
  saveRef.current = () => {
    void requestSave()
  }

  const [copySaved, setCopySaved] = useState(false)

  useEffect(
    () =>
      textDraftLifecycle.onConflict((relativePath, result) => {
        if (relativePath !== preview.relativePath) return
        conflictRef.current = result.current
        setState("conflict")
        setError(null)
      }),
    [preview.relativePath]
  )

  const handleChange = useCallback(
    (content: string) => {
      if (textDraftLifecycle.isLocked) return
      if (content === draftRef.current) return
      draftRef.current = content
      setCopySaved(false)
      setEditorContent(content)
      setError(null)
      const changed = content !== savedRef.current
      onDraftChange(
        pathRef.current,
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
      ref={sectionRef}
      className="text-file-preview text-file-editor"
      aria-label={t("Text editor for {path}", {
        path: preview.relativePath,
      })}
      data-text-file-preview={preview.relativePath}
      data-text-file-preview-state="text"
      data-text-file-preview-truncated="false"
      data-text-file-editor={preview.relativePath}
      data-text-file-save-state={state}
      onKeyDownCapture={(event) => {
        if (
          acceptsTextFileSave(event.nativeEvent, event.currentTarget, platform)
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
          <button
            type="button"
            className="text-editor-save-issue-action"
            onClick={() => {
              void window.eidosLite
                .saveTextDraftCopy(preview.relativePath, draftRef.current)
                .then((saved) => {
                  if (saved) setCopySaved(true)
                })
                .catch((cause) => setError(saveFailureMessage(cause, t)))
            }}
          >
            {t("Save a copy")}
          </button>
          {copySaved ? (
            <span role="status">
              {t("Copy saved. The original draft is still unsaved.")}
            </span>
          ) : null}
        </div>
      ) : null}
      <MarkdownEditorSurface
        key={`${identityRef.current}:${editorGeneration}`}
        documentKey={`${identityRef.current}:${editorGeneration}`}
        relativePath={preview.relativePath}
        assetDocumentPath={preview.relativePath}
        content={editorContent}
        editingMode={editingMode}
        compatibilityProfile={markdownCompatibilityProfile}
        navigationTarget={navigationTarget}
        onOpenInternalLink={(request) =>
          onOpenInternalLink?.(preview.relativePath, request)
        }
        theme={theme}
        persistSourceEditorState
        autoFocus={autoFocus}
        focusRequestToken={focusRequestToken}
        focusShortcutLabel={focusShortcutLabel}
        keyboardShortcuts={keyboardShortcuts}
        onEditingModeChange={onEditingModeChange}
        onChange={handleChange}
      />
      {saveStatusTarget
        ? createPortal(
            <span
              className="text-file-title-save"
              data-save-state={state}
              data-save-path={preview.relativePath}
            >
              <span
                className="text-file-save-announcement"
                role="status"
                aria-live="polite"
              >
                {t(
                  state === "saving"
                    ? "Saving…"
                    : state === "saved"
                      ? "Saved to disk"
                      : state === "error"
                        ? "Save failed"
                        : state === "conflict"
                          ? "Changed on disk"
                          : "Unsaved changes"
                )}
              </span>
              {state !== "saved" ? (
                <button
                  type="button"
                  className="text-file-title-save-action"
                  disabled={state === "saving" || state === "conflict"}
                  aria-label={
                    state === "conflict"
                      ? t("Changed on disk")
                      : state === "saving"
                        ? t("Saving…")
                        : t("Save {path} ({shortcut})", {
                            path: preview.relativePath,
                            shortcut:
                              platform === "darwin" ? "Cmd+S" : "Ctrl+S",
                          })
                  }
                  title={
                    state === "conflict"
                      ? t("Changed on disk")
                      : state === "error"
                        ? `${t("Save failed")}: ${error}`
                        : t("Save {path} ({shortcut})", {
                            path: preview.relativePath,
                            shortcut:
                              platform === "darwin" ? "Cmd+S" : "Ctrl+S",
                          })
                  }
                  onClick={() => void requestSave()}
                >
                  {state === "saving" ? (
                    <LoaderCircle className="spin" aria-hidden="true" />
                  ) : state === "error" || state === "conflict" ? (
                    <CircleAlert aria-hidden="true" />
                  ) : (
                    <span
                      className="text-file-title-save-dot"
                      aria-hidden="true"
                    />
                  )}
                  <span>
                    {t(
                      state === "saving"
                        ? "Saving…"
                        : state === "error"
                          ? "Retry"
                          : state === "conflict"
                            ? "Changed on disk"
                            : "Save"
                    )}
                  </span>
                  {state === "dirty" || state === "error" ? (
                    <kbd>{platform === "darwin" ? "⌘S" : "Ctrl+S"}</kbd>
                  ) : null}
                </button>
              ) : null}
            </span>,
            saveStatusTarget
          )
        : null}
    </section>
  )
}

type BrowserTextPreview = TextPreview & {
  browserPreview: NonNullable<TextPreview["browserPreview"]>
}

function HtmlPreviewSurface({
  previewId,
  url,
  focusRequestToken,
}: {
  previewId: string
  url: string
  focusRequestToken: number
}) {
  const { t } = useEidosLiteI18n()
  const hostRef = useRef<HTMLDivElement>(null)
  useFileContentFocusRequest(focusRequestToken, () =>
    hostRef.current?.querySelector<HTMLElement>("webview")?.focus()
  )
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    let guest: Electron.WebviewTag | undefined
    setState("loading")
    setError(null)
    void window.eidosLite
      .openHtmlPreview({ previewId, url })
      .then((partition) => {
        if (!active || !hostRef.current) return
        guest = document.createElement("webview") as Electron.WebviewTag
        guest.className = "html-preview-webview"
        guest.setAttribute("partition", partition)
        guest.setAttribute("src", url)
        guest.setAttribute("aria-label", "HTML preview")
        guest.addEventListener("dom-ready", () => {
          if (active) setState("ready")
        })
        guest.addEventListener("did-fail-load", (event) => {
          if (active && event.isMainFrame && event.errorCode !== -3) {
            setError(event.errorDescription)
            setState("error")
          }
        })
        guest.addEventListener("render-process-gone", () => {
          if (active) setState("error")
        })
        hostRef.current.appendChild(guest)
      })
      .catch((cause) => {
        if (active) {
          setError(String(cause))
          setState("error")
        }
      })
    return () => {
      active = false
      guest?.remove()
      void window.eidosLite.closeHtmlPreview(previewId)
    }
  }, [previewId, url])
  return (
    <div
      ref={hostRef}
      className="html-preview-host"
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

function MarkdownPreview({
  preview,
  focusRequestToken,
}: {
  preview: BrowserTextPreview
  focusRequestToken: number
}) {
  const { t } = useEidosLiteI18n()
  const articleRef = useRef<HTMLElement>(null)
  useFileContentFocusRequest(focusRequestToken, () =>
    articleRef.current?.focus({ preventScroll: true })
  )
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
        ref={articleRef}
        tabIndex={-1}
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
  platform,
  draft,
  theme,
  markdownFileEditingMode,
  htmlFileOpenMode,
  allowAutoFocus,
  markdownCompatibilityProfile,
  navigationTarget,
  onOpenInternalLink,
  focusRequestToken,
  focusShortcutLabel,
  keyboardShortcuts,
  saveStatusTarget,
  onEditingModeChange,
  onSaved,
  onReload,
  onDraftChange,
}: {
  preview: BrowserTextPreview
  draft?: TextFileDraft
  theme: ResolvedAppearance
  markdownFileEditingMode: EidosLiteMarkdownEditingMode
  htmlFileOpenMode: "preview" | "source"
  allowAutoFocus: boolean
  markdownCompatibilityProfile: EidosLiteMarkdownCompatibilityProfile
  navigationTarget?: MarkdownEditorNavigationTarget
  onOpenInternalLink?(
    sourceRelativePath: string,
    request: MarkdownEditorInternalLinkRequest
  ): void | Promise<void>
  platform: string
  focusRequestToken: number
  focusShortcutLabel?: string
  onReveal(): void
  keyboardShortcuts?: EidosLiteKeyboardShortcuts
  saveStatusTarget?: HTMLElement | null
  onEditingModeChange?(mode: EidosLiteMarkdownEditingMode): void
  onSaved(file: TextPreview): void
  onReload(preview: TextFilePreviewResult): void
  onDraftChange(relativePath: string, draft: TextFileDraft | null): void
}) {
  const { t } = useEidosLiteI18n()
  const mode = htmlFileOpenMode === "source" ? "edit" : "preview"
  const reactId = useId()
  const previewId = useMemo(
    () => `html-preview-${reactId.replace(/[^\w:-]/gu, "")}`,
    [reactId]
  )
  const kindLabel = preview.browserPreview.kind === "html" ? "HTML" : "Markdown"
  const previewLabel = t("{kind} preview of {path}", {
    kind: kindLabel,
    path: preview.relativePath,
  })
  const htmlPreview =
    preview.browserPreview.kind === "html" ? preview.browserPreview : null

  if (
    preview.browserPreview.kind === "markdown" ||
    navigationTarget?.textSearch
  ) {
    return (
      <EditableTextFile
        key={preview.editorIdentity ?? preview.relativePath}
        preview={preview}
        platform={platform}
        draft={draft}
        theme={theme}
        editingMode={markdownFileEditingMode}
        markdownCompatibilityProfile={markdownCompatibilityProfile}
        navigationTarget={navigationTarget}
        onOpenInternalLink={onOpenInternalLink}
        focusRequestToken={focusRequestToken}
        focusShortcutLabel={focusShortcutLabel}
        keyboardShortcuts={keyboardShortcuts}
        saveStatusTarget={saveStatusTarget}
        onEditingModeChange={onEditingModeChange}
        onSaved={onSaved}
        onReload={onReload}
        onDraftChange={onDraftChange}
      />
    )
  }

  return (
    <section
      className="document-file-preview"
      aria-label={previewLabel}
      data-document-file-preview={preview.relativePath}
      data-document-file-preview-kind={preview.browserPreview.kind}
      data-document-file-preview-mode={mode}
    >
      <div className="document-preview-body">
        {mode === "preview" ? (
          htmlPreview ? (
            <HtmlPreviewSurface
              previewId={previewId}
              url={htmlPreview.url}
              focusRequestToken={focusRequestToken}
            />
          ) : (
            <MarkdownPreview
              preview={preview}
              focusRequestToken={focusRequestToken}
            />
          )
        ) : (
          <EditableTextFile
            key={preview.editorIdentity ?? preview.relativePath}
            preview={preview}
            platform={platform}
            draft={draft}
            theme={theme}
            editingMode="source"
            autoFocus={allowAutoFocus}
            focusRequestToken={focusRequestToken}
            focusShortcutLabel={focusShortcutLabel}
            saveStatusTarget={saveStatusTarget}
            onEditingModeChange={onEditingModeChange}
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
  markdownFileEditingMode = "source",
  htmlFileOpenMode = "preview",
  allowAutoFocus = true,
  markdownCompatibilityProfile = "eidos",
  navigationTarget,
  onOpenInternalLink,
  platform,
  focusRequestToken = 0,
  keyboardShortcuts,
  saveStatusTarget,
  onEditingModeChange,
  onReveal,
  onSaved,
  onReload,
  onDraftChange,
}: {
  preview: TextSurfacePreview
  draft?: TextFileDraft
  theme: ResolvedAppearance
  markdownFileEditingMode?: EidosLiteMarkdownEditingMode
  htmlFileOpenMode?: "preview" | "source"
  /** Background previews keep keyboard focus in their owning record view. */
  allowAutoFocus?: boolean
  markdownCompatibilityProfile?: EidosLiteMarkdownCompatibilityProfile
  navigationTarget?: MarkdownEditorNavigationTarget
  onOpenInternalLink?(
    sourceRelativePath: string,
    request: MarkdownEditorInternalLinkRequest
  ): void | Promise<void>
  platform: string
  focusRequestToken?: number
  keyboardShortcuts?: EidosLiteKeyboardShortcuts
  saveStatusTarget?: HTMLElement | null
  onEditingModeChange?(mode: EidosLiteMarkdownEditingMode): void
  onReveal(): void
  onSaved(file: TextPreview): void
  onReload(preview: TextFilePreviewResult): void
  onDraftChange(relativePath: string, draft: TextFileDraft | null): void
}) {
  const { t } = useEidosLiteI18n()
  const focusShortcutLabel =
    keyboardShortcuts?.["focus-file-content"] === null
      ? undefined
      : workspaceShortcutLabel(
          "focus-file-content",
          platform === "darwin",
          keyboardShortcuts
        )
  const fallbackFocusRef = useRef<HTMLElement>(null)
  useFileContentFocusRequest(focusRequestToken, () =>
    fallbackFocusRef.current?.focus({ preventScroll: true })
  )
  if (preview.type === "unavailable") {
    return (
      <section
        ref={fallbackFocusRef}
        tabIndex={-1}
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
          key={preview.editorIdentity ?? preview.relativePath}
          preview={preview as BrowserTextPreview}
          draft={draft}
          theme={theme}
          markdownFileEditingMode={markdownFileEditingMode}
          htmlFileOpenMode={htmlFileOpenMode}
          allowAutoFocus={allowAutoFocus}
          markdownCompatibilityProfile={markdownCompatibilityProfile}
          navigationTarget={navigationTarget}
          onOpenInternalLink={onOpenInternalLink}
          platform={platform}
          focusRequestToken={focusRequestToken}
          focusShortcutLabel={focusShortcutLabel}
          keyboardShortcuts={keyboardShortcuts}
          saveStatusTarget={saveStatusTarget}
          onEditingModeChange={onEditingModeChange}
          onReveal={onReveal}
          onSaved={onSaved}
          onReload={onReload}
          onDraftChange={onDraftChange}
        />
      )
    }
    return (
      <EditableTextFile
        key={preview.editorIdentity ?? preview.relativePath}
        preview={preview}
        platform={platform}
        draft={draft}
        theme={theme}
        navigationTarget={navigationTarget}
        saveStatusTarget={saveStatusTarget}
        focusRequestToken={focusRequestToken}
        focusShortcutLabel={focusShortcutLabel}
        keyboardShortcuts={keyboardShortcuts}
        onEditingModeChange={onEditingModeChange}
        onSaved={onSaved}
        onReload={onReload}
        onDraftChange={onDraftChange}
      />
    )
  }

  return (
    <section
      ref={fallbackFocusRef}
      tabIndex={-1}
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
