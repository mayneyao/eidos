import { useReadonlySqlite } from "./use-readonly-sqlite"
// import { useSqlite } from "./use-sqlite"

export const usePreviewTableFormula = () => {
  const sqlite = useReadonlySqlite()
  // const { sqlite } = useSqlite()

  const preview = async ({
    tableName,
    formula,
    rowId,
  }: {
    tableName: string
    formula: string
    rowId: string | null
  }) => {
    if (!sqlite) {
      throw new Error("Sqlite is not initialized")
    }
    if (!rowId) {
      console.error("Row ID is not provided")
      return null
    }
    const result = await sqlite.sql4mainThread2(
      `SELECT (${formula}) as formula_preview_result FROM ${tableName} WHERE _id = '${rowId}'`
    )
    return result?.[0]?.formula_preview_result
  }

  return {
    preview,
  }
}
