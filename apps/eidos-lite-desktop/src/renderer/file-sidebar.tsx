import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { LoaderCircle, RefreshCw, X } from "lucide-react"
import type {
  OpenEidosFileResult,
  TextFilePreviewResult,
  EidosLiteMarkdownEditingMode,
  EidosLiteMarkdownCompatibilityProfile,
} from "../shared/contracts"
import type { PluginOpenResult } from "../shared/plugins"
import type { EidosLiteKeyboardShortcuts } from "../shared/keyboard-shortcuts"
import type { ResolvedAppearance } from "./app-appearance"
import { IpcEidosFileDataSource } from "./ipc-data-source"
import { PluginEditor } from "./plugin-editor"
import { fileViewRequest } from "./plugin-file-request"
import { MediaFilePreview } from "./media-file-preview"
import {
  TextFilePreview,
  prepareTextFilePreview,
  type TextFileDraft,
} from "./text-file-preview"
import { textDraftLifecycle } from "./text-draft-lifecycle"
import { useEidosLiteI18n } from "./i18n"

const EidosFileWorkbench = lazy(async () => {
  const module = await import("./eidos-file-workbench")
  return { default: module.EidosFileWorkbench }
})
type FileModel = {
  path: string
  plugin: PluginOpenResult
} & (
  | { type: "file"; preview: TextFilePreviewResult }
  | {
      type: "eidos"
      opened: OpenEidosFileResult
      source: IpcEidosFileDataSource
      tableId: string
      rowId: string | null
    }
)

export function FileSidebar(props: {
  relativePath: string
  disabled: boolean
  theme: ResolvedAppearance
  platform: string
  drafts: Record<string, TextFileDraft | undefined>
  markdownFileEditingMode: EidosLiteMarkdownEditingMode
  markdownCompatibilityProfile: EidosLiteMarkdownCompatibilityProfile
  htmlFileOpenMode: "preview" | "source"
  keyboardShortcuts: EidosLiteKeyboardShortcuts
  menuOrders?: { "grid.cell"?: readonly string[] }
  onMenuOrderChange?: (
    menu: "grid.cell",
    order: readonly string[]
  ) => Promise<void>
  onDraftChange(path: string, draft: TextFileDraft | null): void
  onOpenFile(path: string): void
  onNavigatePlugin(key: string): void
  onReleaseEidosFile(sessionId: string): Promise<void>
  onChanged(): void
  onClose(): void
}) {
  const { t } = useEidosLiteI18n()
  const [model, setModel] = useState<FileModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [builtinPath, setBuiltinPath] = useState<string | null>(null)
  const latest = useRef(props)
  latest.current = props
  const lease = useRef<FileModel | null>(null)
  const body = useRef<HTMLDivElement>(null)

  const releaseRuntime = (sessionId: string) => {
    const current = lease.current
    if (current?.type === "eidos" && current.opened.sessionId === sessionId)
      return
    void latest.current.onReleaseEidosFile(sessionId).catch(() => {})
  }
  useEffect(() => {
    lease.current = model
    return () => {
      lease.current = null
      // StrictMode and snapshot updates can retain the same live Runtime.
      if (model?.type === "eidos")
        queueMicrotask(() => releaseRuntime(model.opened.sessionId))
    }
  }, [model])

  useEffect(() => {
    let active = true
    let accepted = false
    let opened: OpenEidosFileResult | undefined
    let plugin: PluginOpenResult | undefined
    setLoading(true)
    setError(null)
    const path = props.relativePath
    const load = async () => {
      try {
        const eidos = path.toLowerCase().endsWith(".eidos")
        const preview = eidos
          ? undefined
          : await window.eidosLite.previewTextFile(path)
        if (!active) return
        if (eidos) opened = await window.eidosLite.openEidosFile(path)
        if (!active) return
        const draft = textDraftLifecycle.getDraft(path)
        plugin = await window.eidosLite.openPluginEditor(
          path,
          builtinPath === path ? "builtin" : undefined,
          draft
            ? { text: draft.content, expectedRevision: draft.revision }
            : undefined
        )
        if (!active) return
        if (!plugin.instance && preview)
          await prepareTextFilePreview(
            preview,
            latest.current.markdownFileEditingMode
          )
        if (!active) return
        if (opened) {
          const sessionId = opened.sessionId
          const source = new IpcEidosFileDataSource(
            sessionId,
            opened.snapshot,
            (snapshot) => {
              setModel((current) =>
                current?.type === "eidos" &&
                current.opened.sessionId === sessionId
                  ? { ...current, opened: { ...current.opened, snapshot } }
                  : current
              )
            }
          )
          setModel({
            type: "eidos",
            path,
            plugin,
            opened,
            source,
            tableId: opened.snapshot.tables[0]?.table.id ?? "",
            rowId: null,
          })
        } else if (preview) {
          setModel({ type: "file", path, plugin, preview })
        }
        accepted = true
      } catch (cause) {
        if (active)
          setError(
            `${path}: ${cause instanceof Error ? cause.message : String(cause)}`
          )
      } finally {
        if (!accepted) {
          if (plugin?.instance)
            void window.eidosLite
              .closePluginEditor(plugin.instance.ticket)
              .catch(() => {})
          if (opened) releaseRuntime(opened.sessionId)
        }
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [props.relativePath, reload, builtinPath])

  useEffect(() => {
    if (body.current) body.current.inert = loading || props.disabled
  }, [loading, props.disabled, model])
  const unavailable = (cause: unknown) =>
    setError(cause instanceof Error ? cause.message : String(cause))
  const updatePreview = (path: string, preview: TextFilePreviewResult) => {
    setModel((current) =>
      current?.type === "file" && current.path === path
        ? { ...current, path: preview.relativePath, preview }
        : current
    )
  }
  const titlePath = model?.path ?? props.relativePath
  const instance = model?.plugin.instance
  return (
    <aside
      className="file-sidebar"
      aria-label={t("File preview")}
      aria-busy={loading}
    >
      <header>
        <strong title={titlePath}>{titlePath.split("/").at(-1)}</strong>
        <button
          type="button"
          className="icon-button"
          aria-label={t("Refresh")}
          disabled={loading || props.disabled}
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t("Close file preview")}
          onClick={props.onClose}
        >
          <X />
        </button>
      </header>
      {loading && (
        <div className="file-sidebar-status" role="status">
          <LoaderCircle className="spin" size={14} />
          {t("Opening {name}…", {
            name: props.relativePath.split("/").at(-1)!,
          })}
        </div>
      )}
      {(error || model?.plugin.warning) && (
        <div className="file-sidebar-error" role="alert">
          {error ?? model?.plugin.warning}
          {error && (
            <button
              type="button"
              disabled={loading || props.disabled}
              onClick={() => setReload((value) => value + 1)}
            >
              {t("Retry")}
            </button>
          )}
        </div>
      )}
      <div className="file-sidebar-body" ref={body}>
        {instance && model ? (
          <PluginEditor
            key={instance.ticket}
            instance={instance}
            tableRevision={
              model.type === "eidos" ? model.opened.snapshot : undefined
            }
            onDraft={(change, path) =>
              props.onDraftChange(
                path ?? model.path,
                change
                  ? { content: change.text, revision: change.expectedRevision }
                  : null
              )
            }
            onFallback={() => setBuiltinPath(model.path)}
            onRetry={() => setReload((value) => value + 1)}
            onNavigate={props.onNavigatePlugin}
            onOpenFile={props.onOpenFile}
            onError={unavailable}
            onTableRequest={
              model.type === "eidos"
                ? (request) =>
                    fileViewRequest(
                      model.source,
                      instance.editor.key.split("/")[0]!,
                      request,
                      loading || props.disabled
                    )
                : undefined
            }
          />
        ) : model?.type === "eidos" ? (
          <Suspense fallback={null}>
            <EidosFileWorkbench
              relativePath={model.path}
              source={model.source}
              snapshot={model.opened.snapshot}
              activeTableId={model.tableId}
              theme={props.theme}
              disabled={loading || props.disabled}
              keyboardShortcuts={props.keyboardShortcuts}
              menuOrders={props.menuOrders}
              onMenuOrderChange={props.onMenuOrderChange}
              macos={props.platform === "darwin"}
              onOpenSpaceFile={props.onOpenFile}
              inspectedRowId={model.rowId}
              onInspectedRowChange={(rowId) =>
                setModel((current) =>
                  current?.type === "eidos" ? { ...current, rowId } : current
                )
              }
              onRecordNavigate={(tableId, rowId) =>
                setModel((current) =>
                  current?.type === "eidos"
                    ? { ...current, tableId, rowId }
                    : current
                )
              }
              onTableSelect={(tableId) =>
                setModel((current) =>
                  current?.type === "eidos"
                    ? { ...current, tableId, rowId: null }
                    : current
                )
              }
              onSnapshot={(snapshot) =>
                setModel((current) =>
                  current?.type === "eidos" &&
                  current.opened.sessionId === model.opened.sessionId
                    ? { ...current, opened: { ...current.opened, snapshot } }
                    : current
                )
              }
              onError={unavailable}
            />
          </Suspense>
        ) : model?.type === "file" ? (
          model.preview.type === "media" ? (
            <MediaFilePreview
              preview={model.preview}
              platform={props.platform}
              onReveal={() => void window.eidosLite.revealPath(model.path)}
            />
          ) : (
            <TextFilePreview
              preview={model.preview}
              draft={props.drafts[model.path]}
              theme={props.theme}
              platform={props.platform}
              keyboardShortcuts={props.keyboardShortcuts}
              markdownFileEditingMode={props.markdownFileEditingMode}
              markdownCompatibilityProfile={props.markdownCompatibilityProfile}
              htmlFileOpenMode={props.htmlFileOpenMode}
              onDraftChange={props.onDraftChange}
              onReveal={() => void window.eidosLite.revealPath(model.path)}
              onReload={(preview) => updatePreview(model.path, preview)}
              onSaved={(preview) => {
                updatePreview(model.path, preview)
                props.onChanged()
                if (
                  model.path === latest.current.relativePath &&
                  preview.relativePath !== model.path
                )
                  props.onOpenFile(preview.relativePath)
              }}
              onOpenInternalLink={(source, request) => {
                void import("./obsidian-vault")
                  .then(async ({ resolveObsidianSpaceEntry }) => {
                    const entry = await resolveObsidianSpaceEntry(
                      source,
                      request,
                      window.eidosLite.searchSpacePaths
                    )
                    if (entry) props.onOpenFile(entry.relativePath)
                  })
                  .catch(unavailable)
              }}
            />
          )
        ) : null}
      </div>
    </aside>
  )
}
