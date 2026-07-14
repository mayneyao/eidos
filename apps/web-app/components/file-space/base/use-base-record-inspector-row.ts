import { useCallback, useRef, useState } from "react"
import type { BaseRow } from "@eidos.space/base"

interface BaseRecordInspectorRowState {
  row: BaseRow | null
  loading: boolean
  error: string | null
}

function inspectorRowErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unable to load record details"
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
}

export function useBaseRecordInspectorRow(
  loadRow?: (rowId: string) => Promise<BaseRow | null>
) {
  const requestGenerationRef = useRef(0)
  const [state, setState] = useState<BaseRecordInspectorRowState>({
    row: null,
    loading: false,
    error: null,
  })

  const openRow = useCallback(
    (previewRow: BaseRow) => {
      const generation = requestGenerationRef.current + 1
      requestGenerationRef.current = generation
      setState({ row: previewRow, loading: loadRow !== undefined, error: null })
      if (!loadRow) return

      const rowId = String(previewRow._id ?? "")
      void loadRow(rowId)
        .then((row) => {
          if (generation !== requestGenerationRef.current) return
          if (!row) throw new Error("Record no longer exists")
          setState({ row, loading: false, error: null })
        })
        .catch((error) => {
          if (generation !== requestGenerationRef.current) return
          setState({
            row: previewRow,
            loading: false,
            error: inspectorRowErrorMessage(error),
          })
        })
    },
    [loadRow]
  )

  const closeRow = useCallback(() => {
    requestGenerationRef.current += 1
    setState({ row: null, loading: false, error: null })
  }, [])

  const replaceRow = useCallback((row: BaseRow) => {
    requestGenerationRef.current += 1
    setState({ row, loading: false, error: null })
  }, [])

  const retryRow = useCallback(() => {
    if (state.row) openRow(state.row)
  }, [openRow, state.row])

  return {
    inspectedRow: state.row,
    inspectorLoading: state.loading,
    inspectorLoadError: state.error,
    openInspectorRow: openRow,
    closeInspectorRow: closeRow,
    replaceInspectorRow: replaceRow,
    retryInspectorRow: retryRow,
  }
}
