import { shortenId, uuidv7 } from "@/lib/utils"
import type { DataSpace } from "../data-space"
import { allFieldTypesMap } from "../fields"
import { FieldType } from "../fields/const"
import {
  parseColumnTypesFromComments,
  parseSearchableFieldsFromComments,
} from "../sqlite/sql-comment-parser"
import { TreeNodeType } from "../types/ITreeNode"
import type { IField } from "../types/IField"
import { ViewTypeEnum } from "../types/IView"

/**
 * Generate search snippet with highlight
 * @param text Original text
 * @param query Search query
 * @returns Snippet with highlighted query
 */
function generateSnippet(text: string, query: string): string {
  if (!text || !query) return text

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)

  if (index === -1) return text

  const snippetLength = 60
  const start = Math.max(0, index - snippetLength / 2)
  const end = Math.min(text.length, index + query.length + snippetLength / 2)

  let snippet = text.slice(start, end)

  // Add ellipsis if truncated
  if (start > 0) snippet = "..." + snippet
  if (end < text.length) snippet = snippet + "..."

  // Add highlight
  const highlightRegex = new RegExp(
    "(" + query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")",
    "gi"
  )
  snippet = snippet.replace(highlightRegex, "<mark>$1</mark>")

  return snippet
}

export class SqlDataView {
  constructor(private dataSpace: DataSpace) {}

  async delete(id: string) {
    const viewName = `vw_${id}`
    await this.dataSpace.db.prepare("BEGIN TRANSACTION;").run()
    try {
      await this.dataSpace.db.prepare(`DROP VIEW IF EXISTS ${viewName};`).run()
      await this.dataSpace.view.deleteByTableId(id)
      await this.dataSpace.column.deleteByRawTableName(viewName)
      await this.dataSpace.tree.del(id)
    } catch (error) {
      await this.dataSpace.db.prepare("ROLLBACK;").run()
      console.error("Error in delete view transaction:", error)
      throw error
    } finally {
      await this.dataSpace.db.prepare("COMMIT;").run()
    }
  }

  async getAllDataViewIds() {
    const views = await this.dataSpace.exec2(
      `SELECT name FROM sqlite_master WHERE type='view' and name like 'vw_%';`
    )
    return views.map((view: any) => view.name.replace("vw_", ""))
  }

  async isDataViewExist(id: string) {
    const viewName = `vw_${id}`
    const view = await this.dataSpace.db.exec({
      sql: `SELECT name, sql FROM sqlite_master WHERE type='view' and name = ?;`,
      bind: [viewName],
    })
    return view.length > 0
  }

  async getViewRawQuery(tableName: string) {
    const view = await this.dataSpace.db.exec({
      sql: `SELECT sql FROM sqlite_master WHERE type='view' and name = ?;`,
      bind: [tableName],
    })

    const tmpView = await this.dataSpace.db.exec({
      sql: `SELECT sql FROM temp.sqlite_master WHERE type='view' and name = ?;`,
      bind: [tableName],
    })

    const fullSql = view[0]?.sql || tmpView[0]?.sql || ""

    // Extract only the query part, removing CREATE VIEW statement
    // Match pattern: CREATE VIEW view_name AS query_statement
    const createViewRegex =
      /^CREATE\s+(?:TEMPORARY\s+)?VIEW\s+\w+\s+AS\s+(.*)$/is
    const match = fullSql.match(createViewRegex)

    if (match && match[1]) {
      return match[1].trim()
    }

    // Fallback to original SQL if pattern doesn't match
    return fullSql
  }

  async getViewColumns(id: string) {
    const viewName = `vw_${id}`
    const columns = await this.dataSpace.db
      .prepare(`PRAGMA table_info(${viewName});`)
      .all()
    return columns
  }

  async getViewFields(id: string): Promise<IField[]> {
    const viewName = `vw_${id}`
    const columns = await this.getViewColumns(id)
    const modifiedColumns = await this.dataSpace.column.list({
      table_name: viewName,
    })
    return columns.map((column) => {
      const modifiedColumn = modifiedColumns.find(
        (c) => c.table_column_name === column.name
      )
      if (modifiedColumn) {
        return modifiedColumn
      }
      return {
        name: column.name,
        type: FieldType.Text,
        table_column_name: column.name,
        table_name: viewName,
        property: {},
      }
    })
  }

  async updateViewColumn({
    tableName,
    tableColumnName,
    type,
    property,
  }: {
    tableName: string
    tableColumnName: string
    type: FieldType
    property: any
  }) {
    const defaultFieldProperty =
      allFieldTypesMap[type].getDefaultFieldProperty()

    const isEmptyProperty = Object.keys(property).length === 0
    const updateData = {
      name: tableColumnName,
      type,
      table_name: tableName,
      table_column_name: tableColumnName,
      property: isEmptyProperty ? defaultFieldProperty : property,
    }
    const column = await this.dataSpace.column.getColumn(
      tableName,
      tableColumnName
    )
    if (!column) {
      await this.dataSpace.column.addPureUIColumn(updateData)
    } else {
      await this.dataSpace.column.updatePureUIColumn(updateData)
    }
  }

  async createDataView(
    id: string,
    createViewSql: string,
    isTemp: boolean = false
  ) {
    const viewName = `vw_${id}`
    // delete temp view
    await this.dataSpace.db.prepare(`DROP VIEW IF EXISTS ${viewName};`).run()
    await this.dataSpace.view.deleteByTableId(id)
    // Clean up existing column metadata for this view
    await this.dataSpace.column.deleteByRawTableName(viewName)
    await this.dataSpace.db.prepare("BEGIN TRANSACTION;").run()

    try {
      await this.dataSpace.db
        .prepare(
          `CREATE ${isTemp ? "TEMPORARY" : ""} VIEW IF NOT EXISTS ${viewName} AS \n ${createViewSql};`
        )
        .run()
      await this.dataSpace.view.add({
        id: shortenId(uuidv7()),
        name: `New View`,
        type: ViewTypeEnum.Grid,
        table_id: id,
        query: `select * from ${viewName}`,
      })
      // Parse column types from SQL comments and create column metadata
      await this.createColumnMetadataFromComments(viewName, createViewSql)
    } catch (error) {
      await this.dataSpace.db.prepare("ROLLBACK;").run()
      console.error("Error in createDataView transaction:", error)
      throw error
    } finally {
      await this.dataSpace.db.prepare("COMMIT;").run()
    }
    return true
  }

  /**
   * Create column metadata from SQL comments
   * @param viewName The view name
   * @param createViewSql The SQL used to create the view
   */
  private async createColumnMetadataFromComments(
    viewName: string,
    createViewSql: string
  ) {
    try {
      // Parse column types from SQL comments
      const columnTypes = parseColumnTypesFromComments(createViewSql)

      if (Object.keys(columnTypes).length === 0) {
        // No column type comments found, no need to create metadata
        // System will default to text type for all columns
        return
      }

      // Create column metadata only for columns with type comments
      for (const [columnName, fieldType] of Object.entries(columnTypes)) {
        const defaultProperty =
          allFieldTypesMap[fieldType].getDefaultFieldProperty()
        await this.dataSpace.column.addPureUIColumn({
          name: columnName,
          type: fieldType,
          table_name: viewName,
          table_column_name: columnName,
          property: defaultProperty,
        })
      }
    } catch (error) {
      console.error("Error creating column metadata from comments:", error)
      // Don't throw error here to avoid breaking the view creation
      // Just log the error and continue with default behavior
    }
  }

  async createTableFromDataView(
    viewNodeId: string,
    newTableName: string,
    titleColumnName?: string
  ) {
    const viewName = `vw_${viewNodeId}`
    // 1. Generate a new table ID
    const tableId = uuidv7().split("-").join("")
    const rawTableName = `tb_${tableId}`

    // 2. Get view columns to see what we have
    const columns = await this.dataSpace.db
      .prepare(`PRAGMA table_info(${viewName});`)
      .all()
    const existingColumnNames = new Set(
      columns.map((c: any) => c.name.toLowerCase())
    )

    // Required Eidos columns
    const requiredColumns = [
      {
        name: "_id",
        type: "TEXT PRIMARY KEY NOT NULL",
        eidosType: "row-id",
        defaultValue: "uuidv7()",
      },
      {
        name: "title",
        type: "TEXT",
        eidosType: FieldType.Title,
        defaultValue: "NULL",
      },
      {
        name: "_created_time",
        type: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        eidosType: FieldType.CreatedTime,
        defaultValue: "CURRENT_TIMESTAMP",
      },
      {
        name: "_last_edited_time",
        type: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        eidosType: FieldType.LastEditedTime,
        defaultValue: "CURRENT_TIMESTAMP",
      },
      {
        name: "_created_by",
        type: "TEXT DEFAULT 'unknown'",
        eidosType: FieldType.CreatedBy,
        defaultValue: "'unknown'",
      },
      {
        name: "_last_edited_by",
        type: "TEXT DEFAULT 'unknown'",
        eidosType: FieldType.LastEditedBy,
        defaultValue: "'unknown'",
      },
    ]

    await this.dataSpace.db.prepare("BEGIN TRANSACTION;").run()
    try {
      // 3. Build CREATE TABLE SQL and register columns
      const columnDefs: string[] = []

      // Always add required Eidos columns
      for (const req of requiredColumns) {
        columnDefs.push(`${req.name} ${req.type}`)
      }

      // Add view columns, but handle conflicts with required columns
      for (const col of columns) {
        const lowerName = col.name.toLowerCase()
        if (lowerName === "_id") {
          columnDefs.push(`_original_id ${col.type || "TEXT"}`)
        } else if (lowerName === "title") {
          columnDefs.push(`_original_title ${col.type || "TEXT"}`)
        } else if (requiredColumns.some((r) => r.name === lowerName)) {
          // Skip other system columns if they conflict exactly
        } else {
          columnDefs.push(`${col.name} ${col.type || "TEXT"}`)
        }
      }

      await this.dataSpace.db.exec(
        `CREATE TABLE ${rawTableName} (\n${columnDefs.join(",\n")}\n);`
      )

      // 4. Insert data from view
      const targetColNames: string[] = ["_id"]
      const selectExprs: string[] = [
        `eidos_generate_id("${columns[0]?.name || "1"}")`,
      ]

      for (const col of columns) {
        const lowerName = col.name.toLowerCase()
        if (lowerName === "_id") {
          targetColNames.push("_original_id")
          selectExprs.push(`"${col.name}"`)
        } else if (lowerName === "title") {
          targetColNames.push("_original_title")
          selectExprs.push(`"${col.name}"`)
        } else if (requiredColumns.some((r) => r.name === lowerName)) {
          // Skip
        } else {
          targetColNames.push(`"${col.name}"`)
          selectExprs.push(`"${col.name}"`)
        }
      }

      // Handle title mapping (if user specified a source column for title)
      if (titleColumnName) {
        targetColNames.push("title")
        selectExprs.push(`"${titleColumnName}"`)
      }

      const insertSql = `INSERT INTO ${rawTableName} (${targetColNames.join(
        ", "
      )}) SELECT ${selectExprs.join(", ")} FROM ${viewName}`
      await this.dataSpace.db.exec(insertSql)

      // 5. Add to eidos__tree
      await this.dataSpace.tree.addNode({
        id: tableId,
        name: newTableName,
        type: TreeNodeType.Table,
        parent_id: undefined,
      })

      // 6. Register columns in eidos__column
      // Register required/system columns
      for (const req of requiredColumns) {
        const defaultProperty = (allFieldTypesMap as any)[req.eidosType]
          ? (allFieldTypesMap as any)[req.eidosType].getDefaultFieldProperty()
          : {}

        await this.dataSpace.column.addPureUIColumn({
          name: req.name,
          type: req.eidosType as any,
          table_name: rawTableName,
          table_column_name: req.name,
          property: defaultProperty,
        })
      }

      // Register view columns (including the renamed ones)
      const viewFields = await this.getViewFields(viewNodeId)
      for (const col of columns) {
        const lowerName = col.name.toLowerCase()
        let targetName = col.name
        if (lowerName === "_id") {
          targetName = "_original_id"
        } else if (lowerName === "title") {
          targetName = "_original_title"
        } else if (requiredColumns.some((r) => r.name === lowerName)) {
          continue
        }

        const viewField = viewFields.find(
          (f) => f.table_column_name === col.name
        )
        const type = viewField?.type || FieldType.Text
        const defaultProperty = allFieldTypesMap[type].getDefaultFieldProperty()

        await this.dataSpace.column.addPureUIColumn({
          name: targetName,
          type,
          table_name: rawTableName,
          table_column_name: targetName,
          property: defaultProperty,
        })
      }

      // 7. Create default view for the new table
      await this.dataSpace.view.createDefaultView(rawTableName)

      await this.dataSpace.db.prepare("COMMIT;").run()
      return tableId
    } catch (error) {
      await this.dataSpace.db.prepare("ROLLBACK;").run()
      console.error("Error in createTableFromDataView transaction:", error)
      throw error
    }
  }

  /**
   * Search dataview with LIKE query (not FTS)
   * Return format is consistent with TableFullTextSearch.search()
   *
   * @param viewName View name (e.g., "vw_xxx")
   * @param query Search query
   * @param page Page number (1-based)
   * @param pageSize Page size
   * @returns Search result in the same format as FTS
   */
  async search(
    viewName: string,
    query: string,
    page: number = 1,
    pageSize: number = 20
  ) {
    const startTime = performance.now()

    // Extract tableId from viewName (vw_xxx -> xxx)
    const tableId = viewName.replace("vw_", "")

    // Get view raw SQL from sqlite_master
    const createViewSql = await this.getViewRawQuery(viewName)

    // Parse searchable fields from SQL comments
    const searchableFields = parseSearchableFieldsFromComments(createViewSql)

    if (searchableFields.length === 0) {
      return {
        results: [],
        searchTime: -1,
        totalMatches: 0,
        currentPage: page,
        totalPages: 0,
      }
    }

    // Get view by table_id (DataView uses table_id to store the node ID)
    const views = await this.dataSpace.view.list({ table_id: tableId })
    const view = views[0]
    if (!view?.query) {
      throw new Error(`View for table ${tableId} not found or has no query`)
    }

    const offset = (page - 1) * pageSize

    // Get view columns
    const tableInfo = await this.dataSpace.db.selectObjects(
      `PRAGMA table_info(${viewName})`
    )
    const columns = tableInfo
      .map((col: any) => col.name)
      .filter((name: any) => name.toLowerCase() !== "rowid")

    // Filter searchable fields to only include existing columns (case-insensitive)
    const columnSet = new Set(columns.map((c: string) => c.toLowerCase()))
    const validSearchableFields = searchableFields.filter((field) =>
      columnSet.has(field.toLowerCase())
    )

    if (validSearchableFields.length === 0) {
      return {
        results: [],
        searchTime: -1,
        totalMatches: 0,
        currentPage: page,
        totalPages: 0,
      }
    }

    // Build WHERE clause for LIKE search
    const likeConditions = validSearchableFields
      .map((field) => `${field} LIKE ?`)
      .join(" OR ")
    const likeParams = validSearchableFields.map(() => `%${query}%`)

    // Build count SQL
    const countSql = `
      SELECT COUNT(*) AS total
      FROM (${view.query})
      WHERE ${likeConditions}
    `

    try {
      const [{ total }] = await this.dataSpace.db.selectObjects(
        countSql,
        likeParams
      )

      if (total === 0) {
        return {
          results: [],
          searchTime: 0,
          totalMatches: 0,
          currentPage: page,
          totalPages: 0,
        }
      }

      // Build search SQL with row numbers
      const searchSql = `
        WITH original_view AS (
          SELECT 
            *,
            ROW_NUMBER() OVER () - 1 as row_index
          FROM (${view.query})
        )
        SELECT *
        FROM original_view
        WHERE ${likeConditions}
        ORDER BY row_index
        LIMIT ? OFFSET ?
      `

      const results = await this.dataSpace.db.selectObjects(searchSql, [
        ...likeParams,
        pageSize,
        offset,
      ])

      // Process results to generate matches with snippets
      const processedResults = results.map((row: any) => {
        const matches: Array<{ column: string; snippet: string }> = []

        for (const field of validSearchableFields) {
          const value = row[field]
          if (value != null) {
            const strValue = String(value)
            if (strValue.toLowerCase().includes(query.toLowerCase())) {
              matches.push({
                column: field,
                snippet: generateSnippet(strValue, query),
              })
            }
          }
        }

        const rowIndex = row.row_index
        delete row.row_index

        return {
          row,
          matches,
          rowIndex,
        }
      })

      const endTime = performance.now()
      const searchTime = Math.round(endTime - startTime)

      return {
        results: processedResults,
        searchTime,
        totalMatches: total,
        currentPage: page,
        totalPages: Math.ceil(total / pageSize),
      }
    } catch (error) {
      console.error("DataView search error:", error)
      throw error
    }
  }
}
