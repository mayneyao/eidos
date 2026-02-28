import { useEffect, useState } from "react"

import { transformAggregateItems2SqlString } from "@/packages/core/sqlite/sql-aggregate-parser"
import { useDebounce } from "@/apps/web-app/hooks/use-debounce"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useTableFields } from "@/apps/web-app/hooks/use-table-fields"
import { useView } from "@/apps/web-app/hooks/use-view"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { MultiSelect } from "@/components/multi-select"
import { QueryBuilder } from "@/components/query-builder/query-builder"
import { SQLQueryDisplay } from "@/components/sql-query-display"
import { TableSelector } from "@/components/table-selector"
import { ViewSelector } from "@/components/view-selector"

import type { DataTableConfig } from "./types"

interface TableDataSourceProps {
  config: DataTableConfig
  onConfigChange: (config: DataTableConfig) => void
  onDataChange: (data: any[]) => void
}

const queryData2Readable = (
  sqlResult: Record<string, any>[],
  fields: {
    name: string
    type: string
    label: string
  }[]
) => {
  return sqlResult.map((row) => {
    const obj: any = row
    fields.forEach((field) => {
      if (field.name in obj) {
        obj[field.label] = obj[field.name]
        delete obj[field.name]
      }
    })
    return obj
  })
}

const getFieldMappings = (
  fields: {
    name: string
    type: string
    label: string
  }[]
) => {
  return fields.reduce(
    (acc, field) => {
      acc[field.name] = field.label
      return acc
    },
    {} as Record<string, string>
  )
}

export function TableDataSource({
  config,
  onConfigChange,
  onDataChange,
}: TableDataSourceProps) {
  const [sql, setSql] = useState<string>("")
  const [isExecutingQuery, setIsExecutingQuery] = useState(false)
  const [dataError, setDataError] = useState<string>("")
  const { sqlite } = useSqlite()
  const { fields, loading: loadingFields } = useTableFields(config.tableId)

  const debouncedConfigChange = useDebounce((newConfig: DataTableConfig) => {
    onConfigChange(newConfig)
  }, 300)

  const handleFieldSelection = (selectedFields: string[]) => {
    onConfigChange({
      ...config,
      selectedFields,
    })
  }

  const view = useView({ viewId: config.viewId })

  useEffect(() => {
    if (config.transforms?.[0]) {
      const baseQuery = view ? view.query : `SELECT * FROM tb_${config.tableId}`

      const sql = transformAggregateItems2SqlString(
        baseQuery,
        config.transforms[0].config.aggregations,
        config.transforms[0].config.groupBy,
        config.selectedFields
      )
      setSql(sql)
    }
  }, [config.selectedFields, config.transforms, config.tableId, view])

  const fieldMappings = getFieldMappings(fields)

  const handleExecuteQuery = async () => {
    if (!sql || !sqlite) return
    setIsExecutingQuery(true)
    try {
      const queryResult = await sqlite?.sql4mainThread(sql, [], "object")
      console.log("queryResult", sql, queryResult)
      const readableData = queryData2Readable(queryResult, fields)
      onDataChange(readableData)
      setDataError("")
    } catch (err) {
      console.error(err)
      setDataError("Failed to execute query")
    }
    setIsExecutingQuery(false)
  }

  return (
    <div className="space-y-4">
      <Label>Table ID</Label>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <TableSelector
            value={config.tableId}
            onSelect={(tableId) => onConfigChange({ ...config, tableId })}
          />
          {config.tableId && (
            <ViewSelector
              tableId={config.tableId}
              value={config.viewId}
              onSelect={(viewId) => onConfigChange({ ...config, viewId })}
            />
          )}
        </div>

        {config.tableId && (
          <div className="space-y-4">
            {loadingFields ? (
              <div>Loading table fields...</div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Select Fields</Label>
                  <MultiSelect
                    options={fields.map((f) => ({
                      label: f.label,
                      value: f.name,
                    }))}
                    selected={config.selectedFields || []}
                    onChange={handleFieldSelection}
                    placeholder="Select fields to query..."
                  />
                </div>

                <QueryBuilder
                  fields={fields}
                  transforms={config.transforms}
                  onQueryChange={async (transforms) => {
                    try {
                      const aggregateItems = transforms[0].config.aggregations
                      const groupByColumns = transforms[0].config.groupBy
                      const baseQuery = view
                        ? view.query
                        : `SELECT * FROM tb_${config.tableId}`

                      const newSql = transformAggregateItems2SqlString(
                        baseQuery,
                        aggregateItems,
                        groupByColumns,
                        config.selectedFields
                      )

                      setSql(newSql)
                      debouncedConfigChange({ ...config, transforms })
                    } catch (err) {
                      console.error("Failed to build query:", err)
                      setDataError("Failed to build query")
                    }
                  }}
                />
              </>
            )}
            <div className="flex items-start gap-2">
              <SQLQueryDisplay query={sql} fieldMappings={fieldMappings} />
              <Button onClick={handleExecuteQuery} disabled={isExecutingQuery}>
                {"Execute Query"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
