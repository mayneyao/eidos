import { useCallback, useRef, useState } from "react"
import type { EidosFileRow } from "@eidos.space/eidos-file"

interface EidosFileRecordInspectorRowState {
  row: EidosFileRow | null
  loading: boolean
  error: string | null
  complete: boolean
}

function inspectorRowErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unable to load record details"
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
}

export function useEidosFileRecordInspectorRow(
  loadRow?: (rowId: string) => Promise<EidosFileRow | null>,
  preservePreviousRow = false
) {
  const requestGenerationRef = useRef(0)
  const requestedRowRef = useRef<EidosFileRow | null>(null)
  const [state, setState] = useState<EidosFileRecordInspectorRowState>({
    row: null,
    loading: false,
    error: null,
    complete: false,
  })

  const openRow = useCallback(
    (previewRow: EidosFileRow) => {
      const generation = requestGenerationRef.current + 1
      requestGenerationRef.current = generation
      requestedRowRef.current = previewRow
      setState((current) => ({
        row:
          preservePreviousRow && loadRow && current.complete
            ? current.row
            : previewRow,
        loading: loadRow !== undefined,
        error: null,
        complete: !loadRow || (preservePreviousRow && current.complete),
      }))
      if (!loadRow) return

      const rowId = String(previewRow._id ?? "")
      void loadRow(rowId)
        .then((row) => {
          if (generation !== requestGenerationRef.current) return
          if (!row) throw new Error("Record no longer exists")
          setState({ row, loading: false, error: null, complete: true })
        })
        .catch((error) => {
          if (generation !== requestGenerationRef.current) return
          setState({
            row: previewRow,
            loading: false,
            error: inspectorRowErrorMessage(error),
            complete: false,
          })
        })
    },
    [loadRow, preservePreviousRow]
  )

  const closeRow = useCallback(() => {
    requestGenerationRef.current += 1
    requestedRowRef.current = null
    setState({ row: null, loading: false, error: null, complete: false })
  }, [])

  const replaceRow = useCallback((row: EidosFileRow) => {
    requestGenerationRef.current += 1
    setState({ row, loading: false, error: null, complete: true })
  }, [])

  const retryRow = useCallback(() => {
    if (requestedRowRef.current) openRow(requestedRowRef.current)
  }, [openRow])

  return {
    inspectedRow: state.row,
    inspectorLoading: state.loading,
    inspectorHasCompleteRow: state.complete,
    inspectorLoadError: state.error,
    openInspectorRow: openRow,
    closeInspectorRow: closeRow,
    replaceInspectorRow: replaceRow,
    retryInspectorRow: retryRow,
  }
}
