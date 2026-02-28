import { useEffect, useState } from "react"
import { useSqlite } from "./use-sqlite"
import { getRawTableNameById } from "@/lib/utils"

export interface TableField {
  name: string
  type: string
  label: string
}

export function useTableFields(tableId: string | undefined) {
  const [fields, setFields] = useState<TableField[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const { sqlite } = useSqlite()

  useEffect(() => {
    if (!tableId) {
      setFields([])
      return
    }

    async function fetchTableFields() {
      setLoading(true)
      setError(undefined)
      if (!sqlite || !tableId) return
      try {
        console.log("fetchTableFields", tableId)
        const fields = await sqlite?.listUiColumns(getRawTableNameById(tableId))
        const tableFields: TableField[] = fields.map((field: any) => ({
          name: field.table_column_name,
          type: field.type,
          label: field.label || field.name,
        }))

        setFields(tableFields)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch table fields"
        )
      } finally {
        setLoading(false)
      }
    }

    fetchTableFields()
  }, [tableId])

  return { fields, loading, error }
}
