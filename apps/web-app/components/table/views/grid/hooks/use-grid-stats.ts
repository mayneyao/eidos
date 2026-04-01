import { useCallback, useEffect, useMemo, useState } from "react"

import type {
  ColumnStatConfig,
  ColumnStatResult,
  ColumnStatType,
  ViewColumnStatsConfig,
} from "@/packages/core/types/IColumnStats"
import {
  getSupportedStats,
  isStatSupported,
} from "@/packages/core/types/IColumnStats"
import {
  calculateColumnStats,
  calculateStat,
  type StatCalcContext,
} from "@/packages/core/stats"
import type { IField } from "@/packages/core/types/IField"
import type { IView, IGridViewProperties } from "@/packages/core/types/IView"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useViewOperation } from "@/components/table/hooks"

export interface UseGridStatsOptions {
  tableName: string
  view: IView<IGridViewProperties>
  columns: IField[]
  viewCount: number
}

export interface UseGridStatsReturn {
  // Column stats config (user-configured)
  columnStatsConfig: ViewColumnStatsConfig
  // Stats calculation results
  statsResults: Record<string, ColumnStatResult>
  // Whether loading
  isLoading: boolean
  // Update column stat config
  updateColumnStat: (
    columnName: string,
    config: ColumnStatConfig | null
  ) => Promise<void>
  // Get supported stat types for column
  getSupportedStatsForColumn: (column: IField) => ColumnStatType[]
  // Check if supports certain stat
  isSupported: (column: IField, statType: ColumnStatType) => boolean
  // Refresh all column stats (for full refresh scenarios like row count changes)
  refreshAllStats: () => Promise<void>
  // Refresh specified column stats (for partial refresh scenarios like cell value changes)
  refreshColumnStat: (columnName: string) => Promise<void>
}

export function useGridStats(options: UseGridStatsOptions): UseGridStatsReturn {
  const { tableName, view, columns, viewCount } = options
  const { sqlite } = useSqlite()
  const { updateView } = useViewOperation()

  // Get valid column names set (for validation)
  const validColumnNames = useMemo(() => {
    return new Set(columns.map((c) => c.table_column_name))
  }, [columns])

  // Get view-configured stats, filter out deleted fields
  const columnStatsConfig = useMemo(() => {
    const config = view.properties?.columnStats || {}
    const validConfig: ViewColumnStatsConfig = {}

    for (const [colName, colConfig] of Object.entries(config)) {
      if (validColumnNames.has(colName)) {
        validConfig[colName] = colConfig
      }
    }

    return validConfig
  }, [view.properties?.columnStats, validColumnNames])

  // Build field type mapping
  const columnTypes = useMemo(() => {
    const map: Record<string, string> = {}
    columns.forEach((c) => {
      map[c.table_column_name] = c.type
    })
    return map
  }, [columns])

  // Stats calculation results
  const [statsResults, setStatsResults] = useState<
    Record<string, ColumnStatResult>
  >({})
  const [isLoading, setIsLoading] = useState(false)

  // Refresh all column stats (full refresh)
  const refreshAllStats = useCallback(async () => {
    if (!sqlite || !tableName) return

    setIsLoading(true)

    try {
      const results = await calculateColumnStats(
        columnStatsConfig,
        tableName,
        columnTypes,
        view.query,
        (sql) => sqlite.sql4mainThread2(sql)
      )
      setStatsResults(results)
    } catch (error) {
      console.error("[GridStats] Failed to calculate stats:", error)
    } finally {
      setIsLoading(false)
    }
  }, [sqlite, tableName, columnStatsConfig, columnTypes, view.query])

  // Refresh specified column stats (partial refresh)
  const refreshColumnStat = useCallback(
    async (columnName: string) => {
      if (!sqlite || !tableName) return

      const config = columnStatsConfig[columnName]
      if (!config) return

      const context: StatCalcContext = {
        tableName,
        columnName,
        fieldType: columnTypes[columnName],
        viewQuery: view.query,
      }

      try {
        const result = await calculateStat(config, context, (sql) =>
          sqlite.sql4mainThread2(sql)
        )

        setStatsResults((prev) => ({
          ...prev,
          [columnName]: result,
        }))
      } catch (error) {
        console.error(`[GridStats] Failed to refresh ${columnName}:`, error)
        setStatsResults((prev) => ({
          ...prev,
          [columnName]: {
            type: config.type,
            value: null,
            displayText: "",
          },
        }))
      }
    },
    [sqlite, tableName, columnStatsConfig, columnTypes, view.query]
  )

  // Recalculate when data changes
  useEffect(() => {
    refreshAllStats()
  }, [refreshAllStats, viewCount])

  // Update column stat config (save to view)
  const updateColumnStat = useCallback(
    async (columnName: string, config: ColumnStatConfig | null) => {
      if (!view?.id) return
      if (!validColumnNames.has(columnName)) return

      const currentConfig = view.properties?.columnStats || {}

      // Clean up deleted fields' stat configs
      const cleanedConfig: ViewColumnStatsConfig = {}
      for (const [name, cfg] of Object.entries(currentConfig)) {
        if (validColumnNames.has(name)) {
          cleanedConfig[name] = cfg
        }
      }

      let newConfig: ViewColumnStatsConfig

      if (config === null) {
        // Delete config
        const { [columnName]: _, ...rest } = cleanedConfig
        newConfig = rest
      } else {
        // Update or add config
        newConfig = {
          ...cleanedConfig,
          [columnName]: config,
        }
      }

      // Save to view
      await updateView(view.id, {
        properties: {
          ...view.properties,
          columnStats: newConfig,
        },
      })
    },
    [view, updateView, validColumnNames]
  )

  // Get supported stat types for column
  const getSupportedStatsForColumn = useCallback((column: IField) => {
    return getSupportedStats(column.type)
  }, [])

  // Check if supports certain stat
  const isSupported = useCallback(
    (column: IField, statType: ColumnStatType) => {
      return isStatSupported(column.type as string, statType)
    },
    []
  )

  return {
    columnStatsConfig,
    statsResults,
    isLoading,
    updateColumnStat,
    getSupportedStatsForColumn,
    isSupported,
    refreshAllStats,
    refreshColumnStat,
  }
}
