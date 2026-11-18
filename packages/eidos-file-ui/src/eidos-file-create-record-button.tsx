import { useEffect, useMemo, useRef, useState } from "react"
import { Plus } from "lucide-react"
import type {
  EidosFileRowMutationResult,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { useEidosFileUI } from "./context"
import type { EidosFileEditorDataSource } from "./data-source"
import { useEidosFileCalendarExecution } from "./eidos-file-calendar-context"
import { eidosFileMutationHistory } from "./eidos-file-mutation-history"
import { useEidosFileCreationContext } from "./eidos-file-temporal-defaults"
import { eidosFileViewRowQuery } from "./eidos-file-view-query"
import { useEidosFilePendingEdit } from "./use-pending-edit"
import { Button } from "./ui/primitives"

/** Shared toolbar action; contextual Calendar/Kanban/Grid creation stays local. */
export function EidosFileCreateRecordButton({
  source,
  table,
  view,
  search = "",
  disabled = false,
  onCreated,
  onError,
}: {
  source: EidosFileEditorDataSource
  table: EidosFileTableSnapshot
  view?: EidosFileViewInfo
  search?: string
  disabled?: boolean
  onCreated: (result: EidosFileRowMutationResult) => void | Promise<void>
  onError: (error: unknown) => void
}) {
  const { translate: t } = useEidosFileUI()
  const creationContext = useEidosFileCreationContext()
  const calendar = useEidosFileCalendarExecution()
  const query = useMemo(
    () => ({
      ...eidosFileViewRowQuery(view, search),
      ...(calendar ? { calendar } : {}),
    }),
    [calendar, search, view]
  )
  const scopeKey = JSON.stringify([
    table.table.id,
    view?.id,
    query,
    creationContext,
  ])
  const scope = useMemo(() => ({ source, scopeKey }), [source, scopeKey])
  const currentScope = useRef(scope)
  currentScope.current = scope
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const [pending, setPending] = useState(false)
  useEidosFilePendingEdit(pending)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const settings = table.table.settings
  const insert = (settings?.capabilities as { insert?: boolean } | undefined)
    ?.insert
  if (
    insert === false ||
    settings?.tableType === "virtual" ||
    settings?.vtabModule ||
    ("readOnly" in source && source.readOnly === true) ||
    typeof source.insertRow !== "function" ||
    !["grid", "gallery", "calendar", "kanban", "feed"].includes(
      view?.type ?? "grid"
    )
  )
    return null
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="eidos-file-workbar-action h-7 shrink-0 gap-1 px-2 text-xs"
      aria-label={t("New record")}
      aria-busy={pending || undefined}
      disabled={disabled || pending || view?.queryStatus === "unsupported"}
      onClick={async () => {
        if (disabled || inFlight.current) return
        inFlight.current = true
        setPending(true)
        const target = scope
        try {
          const result = await eidosFileMutationHistory(
            source
          ).source.insertRow(table.table.id, {}, creationContext, query)
          if (mounted.current && currentScope.current === target)
            await onCreated(result)
        } catch (error) {
          if (mounted.current && currentScope.current === target) onError(error)
        } finally {
          inFlight.current = false
          if (mounted.current) setPending(false)
        }
      }}
    >
      <Plus className="h-3.5 w-3.5" />
      <span className="eidos-file-workbar-action-label">{t("New")}</span>
    </Button>
  )
}
