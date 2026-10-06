import { useEffect, useRef } from "react"
import type { EidosFileTableSnapshot } from "@eidos.space/eidos-file"

declare global {
  interface Window {
    eidosSelectTable?: (id: string) => void
  }
}

/** The native header presents table identity; the mounted editor owns selection. */
export function useMobileTableHeader(
  tables: readonly EidosFileTableSnapshot[],
  selected: string | undefined,
  select: (id: string) => Promise<void>,
  request: <T>(method: string, params?: unknown) => Promise<T>,
  onError: (error: unknown) => void
) {
  const latest = useRef({ tables, select, onError })
  latest.current = { tables, select, onError }
  const serialized = JSON.stringify(
    tables.map(({ table }) => ({ id: table.id, name: table.name }))
  )
  useEffect(() => {
    void request("editor.tables", {
      tables: JSON.parse(serialized),
      selected: selected ?? "",
    }).catch((error) => latest.current.onError(error))
  }, [request, serialized, selected])
  useEffect(() => {
    let switching = false
    const callback = (id: string) => {
      if (
        switching ||
        !latest.current.tables.some(({ table }) => table.id === id)
      )
        return
      switching = true
      void latest.current
        .select(id)
        .catch((error) => latest.current.onError(error))
        .finally(() => {
          switching = false
        })
    }
    window.eidosSelectTable = callback
    return () => {
      if (window.eidosSelectTable === callback) delete window.eidosSelectTable
    }
  }, [])
}
