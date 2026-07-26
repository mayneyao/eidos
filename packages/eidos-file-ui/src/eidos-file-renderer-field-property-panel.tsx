import { useCallback, useState } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileSnapshot,
  EidosFileTableSnapshot,
  UpdateEidosFileFieldInput,
} from "@eidos.space/eidos-file"

import type { EidosFileEditorDataSource } from "./data-source"
import { EidosFileFieldDeleteDialog } from "./eidos-file-field-delete-dialog"
import { EidosFileFieldPropertyPanel } from "./eidos-file-field-property-panel"
import { eidosFileFieldKey } from "./eidos-file-field-visibility"

/** Host-neutral field property surface shared by non-Grid renderers. */
export function EidosFileRendererFieldPropertyPanel({
  source,
  table,
  tables,
  field,
  disabled,
  onSnapshot,
  onClose,
  onEditFormula,
  onEditLookup,
  onError,
}: {
  source: EidosFileEditorDataSource
  table: EidosFileTableSnapshot
  tables?: readonly EidosFileTableSnapshot[]
  field: EidosFileFieldInfo
  disabled: boolean
  onSnapshot?: (snapshot: EidosFileSnapshot) => void
  onClose?: () => void
  onEditFormula?: (field: EidosFileFieldInfo) => void
  onEditLookup?: (field: EidosFileFieldInfo) => void
  onError?: (error: unknown) => void
}) {
  const [deleteFieldTarget, setDeleteFieldTarget] =
    useState<EidosFileFieldInfo | null>(null)
  const updateField = useCallback(
    async (target: EidosFileFieldInfo, changes: UpdateEidosFileFieldInput) => {
      const snapshot = await source.updateField(
        table.table.id,
        eidosFileFieldKey(target),
        changes
      )
      onSnapshot?.(snapshot)
    },
    [onSnapshot, source, table.table.id]
  )

  const deleteField = useCallback(
    async (target: EidosFileFieldInfo) => {
      const snapshot = await source.deleteField(
        table.table.id,
        eidosFileFieldKey(target)
      )
      onSnapshot?.(snapshot)
      onClose?.()
    },
    [onClose, onSnapshot, source, table.table.id]
  )

  return (
    <>
      <EidosFileFieldPropertyPanel
        field={field}
        tables={tables}
        disabled={disabled}
        onClose={() => onClose?.()}
        onUpdate={updateField}
        onDelete={setDeleteFieldTarget}
        onEditFormula={onEditFormula}
        onEditLookup={onEditLookup}
      />
      <EidosFileFieldDeleteDialog
        field={deleteFieldTarget}
        disabled={disabled}
        onOpenChange={(open) => {
          if (!open) setDeleteFieldTarget(null)
        }}
        onDelete={deleteField}
        onError={onError}
      />
    </>
  )
}
