import { useEffect, useState } from "react"

import { Table } from "@/components/table"
import { useDataView } from "@/hooks/use-data-view"
import { useSqlite } from "@/hooks/use-sqlite"
import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
import { useWebviewStore } from "@/apps/web-app/store/webview-store"
import { Loader2 } from "lucide-react"

import type { RawDataAdapter } from "./types"

interface RawDataTableViewProps {
  adapter: RawDataAdapter
  space: string
  url: string
}

export function RawDataTableView({
  adapter,
  space,
  url,
}: RawDataTableViewProps) {
  const { sqlite } = useSqlite()
  const { createTempDataView } = useDataView()
  const { tabId } = useTabContext()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewCreated, setViewCreated] = useState(false)

  // Generate a unique view ID based on adapter
  const viewId = `rawdata_${adapter.name}`
  const viewName = `vw_${viewId}`

  // Create view (cache first - just query existing data)
  useEffect(() => {
    const setupView = async () => {
      if (!sqlite) return

      setIsLoading(true)
      setError(null)

      try {
        const rawQuery = adapter.queries?.raw

        if (!rawQuery) {
          setError(`No 'raw' query defined in adapter ${adapter.name}`)
          setIsLoading(false)
          return
        }

        // Create temporary view with the query
        // Uses cached data from rawdata database
        await createTempDataView(viewId, rawQuery)
        setViewCreated(true)

        // Check if view has data; if not, auto-run adapter once
        const countResult = await sqlite.sql4mainThread(
          `SELECT COUNT(*) as count FROM ${viewName}`,
          [],
          "object"
        )
        const count = (countResult[0] as any)?.count ?? 0
        if (Number(count) === 0) {
          console.log(
            `[RawDataTableView] ${adapter.name} has 0 rows, auto-running adapter`
          )
          await useWebviewStore.getState().runAdapter(tabId, space, adapter)
        }
      } catch (err) {
        console.error("Failed to create temp view:", err)
        setError(err instanceof Error ? err.message : "Failed to create view")
      } finally {
        setIsLoading(false)
      }
    }

    setupView()
  }, [adapter, sqlite, createTempDataView, viewId, tabId, space, viewName])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Loading {adapter.name}...
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center max-w-md p-6">
          <div className="rounded-full bg-destructive/10 p-3">
            <svg
              className="h-6 w-6 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-medium">Failed to load data view</h3>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!viewCreated) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">View not created</p>
      </div>
    )
  }

  return <Table tableName={viewName} space={space} />
}
