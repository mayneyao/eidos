import { useState, useEffect } from "react"
import type { DataEditorProps } from "@glideapps/glide-data-grid"
import { getWorker } from "@/packages/core/sqlite/worker"
import { MsgType } from "@/lib/const"
import { getRawTableNameById } from "@/lib/utils"
import type { IField } from "@/packages/core/types/IField"

/**
 * Custom hook to subscribe to highlight row events from the worker.
 *
 * This hook internally manages the custom highlight regions state.
 *
 * @param tableName - The current table name.
 * @param getIndexByRowId - Callback to get the row index by a given row id.
 * @param showColumns - The list of columns to display.
 * @returns The current custom highlight regions.
 */
export function useHighlightRow(
  tableName: string,
  getIndexByRowId: (rowId: any) => number,
  showColumns: IField<any>[]
): {
  customHighlightRegions: DataEditorProps["highlightRegions"]
  setCustomHighlightRegions: React.Dispatch<
    React.SetStateAction<DataEditorProps["highlightRegions"]>
  >
} {
  const [customHighlightRegions, setCustomHighlightRegions] = useState<
    DataEditorProps["highlightRegions"]
  >([])

  useEffect(() => {
    const worker = getWorker()

    function subscribeHighlightRow(e: MessageEvent<any>) {
      const { type, payload } = e.data

      if (type === MsgType.HighlightRow) {
        const { tableId, rowId, fieldName } = payload

        if (tableName !== getRawTableNameById(tableId)) return

        const index = getIndexByRowId(rowId)

        if (fieldName) {
          const colIndex = showColumns.findIndex((c) => c.name === fieldName)
          if (colIndex > -1) {
            setCustomHighlightRegions([
              {
                color: "rgba(0, 0, 255, 0.1)",
                range: { x: colIndex, y: index, width: 1, height: 1 },
              },
            ])
          }
        } else {
          setCustomHighlightRegions([
            {
              color: "rgba(0, 0, 255, 0.1)",
              range: { x: 0, y: index, width: showColumns.length, height: 1 },
            },
          ])
        }
      }
    }

    worker.addEventListener("message", subscribeHighlightRow)
    window.addEventListener("message", subscribeHighlightRow)

    return () => {
      worker.removeEventListener("message", subscribeHighlightRow)
      window.removeEventListener("message", subscribeHighlightRow)
    }
  }, [tableName, getIndexByRowId, showColumns])

  return { customHighlightRegions, setCustomHighlightRegions }
}
