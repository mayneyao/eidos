import type { EidosFileConnection } from "./connection"

const DEFAULT_STABLE_ROW_PAGE_SIZE = 256

function isQueryResultLimit(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "resource-limit" &&
    "message" in error &&
    typeof error.message === "string" &&
    /Query result exceeds maxResult(?:Rows|Bytes)/.test(error.message)
  )
}

/**
 * Reads a whole user Table without asking an Adapter to materialize the whole
 * result at once. Pages follow the canonical binary Row-ID order, and shrink
 * automatically when a page is still too large for the active Adapter.
 */
export function scanStableRowPages<T extends object>(
  connection: EidosFileConnection,
  options: {
    columnsSql: string
    tableSql: string
    rowIdSql: string
    rowIdKey: keyof T & string
    pageSize?: number
  },
  visit: (rows: T[]) => void
): void {
  let afterRowId: string | null = null
  let pageSize = Math.max(
    1,
    Math.floor(options.pageSize ?? DEFAULT_STABLE_ROW_PAGE_SIZE)
  )

  while (true) {
    let page: T[]
    while (true) {
      const where =
        afterRowId === null
          ? ""
          : ` WHERE ${options.rowIdSql} COLLATE BINARY > ?`
      const bindings = afterRowId === null ? [pageSize] : [afterRowId, pageSize]
      try {
        page = connection.query<T>(
          `SELECT ${options.columnsSql} FROM ${options.tableSql}${where} ORDER BY ${options.rowIdSql} COLLATE BINARY LIMIT ?`,
          bindings
        )
        break
      } catch (error) {
        if (!isQueryResultLimit(error) || pageSize === 1) throw error
        pageSize = Math.max(1, Math.floor(pageSize / 2))
      }
    }

    if (page.length === 0) return
    visit(page)
    const nextRowId = page.at(-1)?.[options.rowIdKey]
    if (typeof nextRowId !== "string" || nextRowId === afterRowId) {
      throw new Error("Stable row scan requires unique text Row IDs")
    }
    afterRowId = nextRowId
    if (page.length < pageSize) return
  }
}
