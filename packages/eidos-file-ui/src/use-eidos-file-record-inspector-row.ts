import { useCallback, useRef, useState } from "react"
import type { EidosFileRow } from "@eidos.space/eidos-file"

interface EidosFileRecordInspectorRowState {
  row: EidosFileRow | null
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

export function useEidosFileRecordInspectorRow(
  loadRow?: (rowId: string) => Promise<EidosFileRow | null>
) {
  const requestGenerationRef = useRef(0)
  const [state, setState] = useState<EidosFileRecordInspectorRowState>({
    row: null,
    loading: false,
    error: null,
  })

  const openRow = useCallback(
    (previewRow: EidosFileRow) => {
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

  const replaceRow = useCallback((row: EidosFileRow) => {
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
