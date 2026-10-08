import { useEffect, useMemo, useState } from "react"
import {
  EidosFileEditorView,
  type EidosFileViewRendererProps,
} from "@eidos.space/eidos-file-ui"
import { eidosFileGalleryPlugin } from "@eidos.space/eidos-file-ui/plugins/gallery"
import { eidosFileKanbanPlugin } from "@eidos.space/eidos-file-ui/plugins/kanban"
import { eidosFileCalendarPlugin } from "@eidos.space/eidos-file-ui/plugins/calendar"
import { eidosFileFeedPlugin } from "@eidos.space/eidos-file-ui/plugins/feed"
import type { PluginResourceContent } from "../shared/plugins"
import { IpcEidosFileDataSource } from "./ipc-data-source"
import { PluginEditor } from "./plugin-editor"
import { tableViewRequest } from "./plugin-table-view"
import { renderSafeMarkdown } from "./markdown-preview"

const plugins = [
  eidosFileGalleryPlugin,
  eidosFileKanbanPlugin,
  eidosFileCalendarPlugin,
  eidosFileFeedPlugin,
]

export function PluginResource({
  content,
}: {
  content: PluginResourceContent
}) {
  if (content.kind === "file-view") return <FileResource content={content} />
  if (content.kind === "image")
    return (
      <img
        src={content.url}
        alt={content.path}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    )
  if (content.kind === "text")
    return /\.md$/i.test(content.path) ? (
      <article
        style={{ padding: 16, height: "100%", overflow: "auto" }}
        dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(content.text) }}
        onClick={(event) => {
          const link = (event.target as HTMLElement).closest("a")
          if (link) {
            event.preventDefault()
            if (link.dataset.markdownExternal)
              void window.eidosLite.openExternalUrl(link.href)
          }
        }}
      />
    ) : (
      <pre
        style={{
          padding: 16,
          height: "100%",
          overflow: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {content.text}
      </pre>
    )
  return (
    <EidosResource
      key={`${content.opened.sessionId}:${content.plugin?.instance?.ticket ?? content.viewId}`}
      content={content}
    />
  )
}

function FileResource({
  content,
}: {
  content: Extract<PluginResourceContent, { kind: "file-view" }>
}) {
  const [error, setError] = useState<string | null>(null)
  if (error || !content.plugin.instance)
    return <div role="alert">{error ?? "View unavailable"}</div>
  return (
    <PluginEditor
      instance={content.plugin.instance}
      onDraft={() => {}}
      onRetry={() => setError("Refresh this panel to reload the view")}
      onFallback={() => setError("Open the source file to choose another view")}
    />
  )
}

function EidosResource({
  content,
}: {
  content: Extract<PluginResourceContent, { kind: "eidos-view" }>
}) {
  const [snapshot, setSnapshot] = useState(content.opened.snapshot)
  const [error, setError] = useState<string | null>(null)
  const source = useMemo(
    () =>
      new IpcEidosFileDataSource(
        content.opened.sessionId,
        content.opened.snapshot
      ),
    [content.opened.sessionId]
  )
  useEffect(() => {
    let active = true,
      generation = 0
    const refresh = () => {
      const current = ++generation
      void source
        .getSnapshot()
        .then((value) => {
          if (active && current === generation) {
            setSnapshot(value)
            setError(null)
          }
        })
        .catch((cause: unknown) => {
          if (active && current === generation) setError(String(cause))
        })
    }
    const off = window.eidosLite.onSpaceChanged(refresh)
    return () => {
      active = false
      off()
    }
  }, [source])
  const table = snapshot.tables.find(
    (item) => item.table.id === content.tableId
  )
  const view = table?.views.find((item) => item.id === content.viewId)
  const renderers = useMemo(() => {
    if (!content.plugin?.instance) return undefined
    const instance = content.plugin.instance
    const Renderer = (props: EidosFileViewRendererProps) => (
      <PluginEditor
        instance={instance}
        onDraft={() => {}}
        onRetry={() => setError("Refresh this panel to reload the plugin")}
        onFallback={() =>
          setError("Open the source file to choose another view")
        }
        onTableRequest={(request) =>
          tableViewRequest(
            props,
            request,
            content.configuration,
            instance.editor.key.split("/")[0]
          )
        }
        tableRevision={props.table}
      />
    )
    return {
      [content.opened.snapshot.tables
        .find((item) => item.table.id === content.tableId)!
        .views.find((item) => item.id === content.viewId)!.type]: Renderer,
    }
  }, [content])
  if (error || !table || !view)
    return (
      <div role="alert" style={{ padding: 16 }}>
        {error ?? "The saved view is unavailable"}
      </div>
    )
  return (
    <EidosFileEditorView
      source={source}
      table={table}
      tables={snapshot.tables}
      view={view}
      disabled
      capabilities={{
        read: true,
        mutate: false,
        resolveAssets: false,
        rawFile: false,
        nativeFileSystem: false,
      }}
      plugins={plugins}
      renderers={renderers}
    />
  )
}
