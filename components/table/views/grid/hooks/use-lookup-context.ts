import { useEffect, useMemo, useState } from "react"

import { FieldType } from "@/lib/fields/const"
import { ILookupContext } from "@/lib/fields/lookup"
import { useSqlite } from "@/hooks/use-sqlite"
import { useUiColumns } from "@/hooks/use-ui-columns"

export const useLookupContext = (tableName: string, databaseName: string) => {
  const { uiColumns } = useUiColumns(tableName, databaseName)
  const [contextMap, setContextMap] = useState<Record<string, ILookupContext>>(
    {}
  )
  const { sqlite } = useSqlite()
  const lookupFields = useMemo(
    () => uiColumns.filter((column) => column.type === FieldType.Lookup),
    [uiColumns]
  )

  useEffect(() => {
    const buildContext = async (fieldIds: string[]) => {
      if (!sqlite) return
      const res = await Promise.all(
        fieldIds.map(async (fieldId) => {
          const context = await sqlite.getLookupContext(tableName, fieldId)
          return {
            fieldId,
            context,
          }
        })
      )
      const contextMap: Record<string, ILookupContext> = {}
      res.forEach((item) => {
        if (item.context) {
          contextMap[item.fieldId] = item.context
        }
      })
      return contextMap
    }

    buildContext(lookupFields.map((field) => field.table_column_name)).then(
      (contextMap) => {
        contextMap && setContextMap(contextMap)
      }
    )
  }, [lookupFields, sqlite, tableName])

  return {
    contextMap,
  }
}
