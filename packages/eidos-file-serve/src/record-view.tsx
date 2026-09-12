import { useMemo, useState } from "react"
import {
  EidosFileEditorView,
  type EidosFileEditorViewProps,
} from "@eidos.space/eidos-file-ui/eidos-file-editor-view"
import { EidosFileRelatedRecordPanel } from "@eidos.space/eidos-file-ui/eidos-file-related-record-panel"
import { eidosFileViewRowQuery } from "@eidos.space/eidos-file-ui/eidos-file-view-query"
import { eidosFileFeedCreatedField } from "@eidos.space/eidos-file-ui/eidos-file-feed-view"

/** One record controller for all browser-hosted views, including Feed. */
export function BrowserEidosFileEditorView(props: EidosFileEditorViewProps) {
  const [rowId, setRowId] = useState<string | null>(null)
  const [presentation, setPresentation] = useState<"panel" | "page">("panel")
  const [recordReload, setRecordReload] = useState(0)
  const togglePresentation = () =>
    setPresentation((current) => (current === "page" ? "panel" : "page"))
  const query = useMemo(() => {
    const base = eidosFileViewRowQuery(props.view, props.search ?? "")
    if (props.view?.type !== "feed" || base.sorts?.length) return base
    const created = eidosFileFeedCreatedField(props.table.fields)
    return created
      ? { ...base, sorts: [{ field: created.id, direction: "desc" as const }] }
      : base
  }, [props.view, props.search, props.table.fields])
  const reloadToken = (props.reloadToken ?? 0) + recordReload
  return (
    <div className="eidos-file-detail-layout relative h-full min-h-0 w-full">
      <EidosFileEditorView
        {...props}
        inspectedRowId={rowId}
        onInspectedRowChange={setRowId}
        recordPresentation={presentation}
        onRecordPresentationToggle={togglePresentation}
        reloadToken={reloadToken}
      />
      {rowId && props.view && props.view.type !== "grid" ? (
        <EidosFileRelatedRecordPanel
          source={props.source}
          table={props.table}
          target={{ tableId: props.table.table.id, rowId, title: "" }}
          presentation={presentation}
          onPresentationToggle={togglePresentation}
          query={query}
          reloadToken={reloadToken}
          onNavigate={setRowId}
          onClose={() => setRowId(null)}
          onMutation={(result) => {
            setRecordReload((current) => current + 1)
            props.onMutation?.(result)
          }}
          disabled={props.disabled}
          onError={props.onError}
          onImportFiles={props.onImportFiles}
          onImportDroppedFiles={props.onImportDroppedFiles}
        />
      ) : null}
    </div>
  )
}
