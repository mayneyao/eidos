import type { Tool } from "ai"
import { z } from "zod"
import type { DataSpace } from "@/packages/core/data-space"
import { generateColumnNameFromFieldName } from "@/lib/utils"

const FIELD_TYPES = [
  "title",
  "text",
  "number",
  "checkbox",
  "date",
  "datetime",
  "select",
  "multi-select",
  "url",
  "file",
  "rating",
  "formula",
  "link",
  "lookup",
] as const

// ── SQL builder for queryRecords ──────────────────────────────────────────

const VALID_OPS = [
  "equals",
  "not",
  "in",
  "notIn",
  "lt",
  "lte",
  "gt",
  "gte",
  "contains",
  "startsWith",
  "endsWith",
] as const

function buildWhereClause(where: Record<string, any>): {
  sql: string
  params: any[]
} {
  const conditions: string[] = []
  const params: any[] = []

  for (const [col, cond] of Object.entries(where)) {
    if (typeof cond === "object" && cond !== null) {
      for (const [op, val] of Object.entries(cond)) {
        if (!VALID_OPS.includes(op as any)) continue
        switch (op) {
          case "equals":
            conditions.push(`"${col}" = ?`)
            params.push(val)
            break
          case "not":
            conditions.push(`"${col}" != ?`)
            params.push(val)
            break
          case "in":
            conditions.push(
              `"${col}" IN (${(val as any[]).map(() => "?").join(",")})`
            )
            params.push(...(val as any[]))
            break
          case "notIn":
            conditions.push(
              `"${col}" NOT IN (${(val as any[]).map(() => "?").join(",")})`
            )
            params.push(...(val as any[]))
            break
          case "lt":
            conditions.push(`"${col}" < ?`)
            params.push(val)
            break
          case "lte":
            conditions.push(`"${col}" <= ?`)
            params.push(val)
            break
          case "gt":
            conditions.push(`"${col}" > ?`)
            params.push(val)
            break
          case "gte":
            conditions.push(`"${col}" >= ?`)
            params.push(val)
            break
          case "contains":
            conditions.push(`"${col}" LIKE ?`)
            params.push(`%${val}%`)
            break
          case "startsWith":
            conditions.push(`"${col}" LIKE ?`)
            params.push(`${val}%`)
            break
          case "endsWith":
            conditions.push(`"${col}" LIKE ?`)
            params.push(`%${val}`)
            break
        }
      }
    } else {
      conditions.push(`"${col}" = ?`)
      params.push(cond)
    }
  }

  return {
    sql: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  }
}

// ── Tools factory ─────────────────────────────────────────────────────────

export function createTableTools(ds: DataSpace): Record<string, Tool> {
  // ── listTables ─────────────────────────────────────────────────────────
  const listTables: Tool = {
    description:
      "List all tables in the current database. Returns id, name, and field count.",
    inputSchema: z.object({}),
    execute: async () => {
      console.log("[tool:listTables] ▶")
      try {
        const tables = await ds.schema.listTables()
        const result = tables.map((t: any) => ({
          id: t.id,
          name: t.name,
          fieldCount: t.fields?.length ?? 0,
        }))
        console.log("[tool:listTables] ✔", { count: result.length })
        return { tables: result }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[tool:listTables] ✖", msg)
        return { error: msg }
      }
    },
  }

  // ── getTableSchema ─────────────────────────────────────────────────────
  const getTableSchemaParams = z.object({
    table_id: z.string().describe("The table ID"),
  })

  const getTableSchema: Tool = {
    description:
      "Get the full schema of a table including all fields with their column names, types, and properties. Use the returned column names for querying records.",
    inputSchema: getTableSchemaParams,
    execute: async (args) => {
      const { table_id } = args as z.infer<typeof getTableSchemaParams>
      console.log("[tool:getTableSchema] ▶", { table_id })
      try {
        const info = await ds.schema.getTable(table_id)
        console.log("[tool:getTableSchema] ✔", {
          name: info.name,
          fieldCount: info.fields.length,
        })
        return {
          id: info.id,
          name: info.name,
          fields: info.fields.map((f: any) => ({
            name: f.name,
            columnName: f.columnName,
            type: f.type,
            property: f.property,
          })),
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[tool:getTableSchema] ✖", msg)
        return { error: msg }
      }
    },
  }

  // ── createTable ────────────────────────────────────────────────────────
  const createTableParams = z.object({
    name: z.string().describe("Table display name"),
    fields: z
      .array(
        z.object({
          name: z.string().describe("Field display name"),
          type: z.enum(FIELD_TYPES).describe("Field type"),
        })
      )
      .min(1)
      .describe(
        "Fields for the table. The first field should typically be a title field."
      ),
  })

  const createTable: Tool = {
    description: `Create a new table with specified fields. Valid field types: ${FIELD_TYPES.join(", ")}. Column names are auto-generated from field names.`,
    inputSchema: createTableParams,
    execute: async (args) => {
      const { name, fields } = args as z.infer<typeof createTableParams>
      console.log("[tool:createTable] ▶", { name, fieldCount: fields.length })
      try {
        const table = await ds.schema.createTable({
          name,
          fields: fields.map((f) => ({
            name: f.name,
            columnName: generateColumnNameFromFieldName(f.name),
            type: f.type,
          })),
        })
        console.log("[tool:createTable] ✔", { id: table.id, name: table.name })
        return { id: table.id, name: table.name, fields: table.fields }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[tool:createTable] ✖", msg)
        return { error: msg }
      }
    },
  }

  // ── deleteTable ────────────────────────────────────────────────────────
  const deleteTableParams = z.object({
    table_id: z.string().describe("The table ID to delete"),
  })

  const deleteTable: Tool = {
    description: "Delete a table and all its data permanently.",
    inputSchema: deleteTableParams,
    execute: async (args) => {
      const { table_id } = args as z.infer<typeof deleteTableParams>
      console.log("[tool:deleteTable] ▶", { table_id })
      try {
        await ds.schema.deleteTable(table_id)
        console.log("[tool:deleteTable] ✔")
        return { success: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[tool:deleteTable] ✖", msg)
        return { error: msg }
      }
    },
  }

  // ── addField ───────────────────────────────────────────────────────────
  const addFieldParams = z.object({
    table_id: z.string().describe("The table ID"),
    name: z.string().describe("Field display name"),
    type: z.enum(FIELD_TYPES).describe("Field type"),
    property: z
      .record(z.any())
      .optional()
      .describe(
        'Optional field property, e.g. { options: ["opt1", "opt2"] } for select fields'
      ),
  })

  const addField: Tool = {
    description: `Add a new field (column) to an existing table. Valid field types: ${FIELD_TYPES.join(", ")}.`,
    inputSchema: addFieldParams,
    execute: async (args) => {
      const { table_id, name, type, property } = args as z.infer<
        typeof addFieldParams
      >
      console.log("[tool:addField] ▶", { table_id, name, type })
      try {
        const field = await ds.schema.addField(table_id, {
          name,
          columnName: generateColumnNameFromFieldName(name),
          type,
          property,
        })
        console.log("[tool:addField] ✔", { columnName: field.columnName })
        return { field }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[tool:addField] ✖", msg)
        return { error: msg }
      }
    },
  }

  // ── queryRecords (uses raw SQL via ds.exec2) ───────────────────────────
  const queryRecordsParams = z.object({
    table_id: z.string().describe("The table ID"),
    where: z
      .record(z.any())
      .optional()
      .describe(
        'Filter conditions using column names. Operators: equals, not, in, notIn, lt, lte, gt, gte, contains, startsWith, endsWith. Example: { "cl_status": { "equals": "done" } }'
      ),
    orderBy: z
      .record(z.enum(["asc", "desc"]))
      .optional()
      .describe(
        'Sort order using column names. Example: { "created_time": "desc" }'
      ),
    take: z
      .number()
      .max(500)
      .optional()
      .describe("Max records to return (default 100, max 500)"),
    skip: z.number().optional().describe("Records to skip for pagination"),
  })

  const queryRecords: Tool = {
    description:
      "Query records from a table. Use column names (from getTableSchema) for where/orderBy. Returns records with _id for update/delete operations.",
    inputSchema: queryRecordsParams,
    execute: async (args) => {
      const { table_id, where, orderBy, take, skip } = args as z.infer<
        typeof queryRecordsParams
      >
      console.log("[tool:queryRecords] ▶", {
        table_id,
        hasWhere: !!where,
        take: take ?? 100,
      })
      try {
        // Get table schema to find the raw table name
        const rawTableName = `tb_${table_id}`

        let sql = `SELECT * FROM "${rawTableName}"`
        const params: any[] = []

        if (where) {
          const { sql: whereSql, params: whereParams } = buildWhereClause(where)
          sql += ` ${whereSql}`
          params.push(...whereParams)
        }

        if (orderBy) {
          const orderClauses = Object.entries(orderBy).map(
            ([col, dir]) => `"${col}" ${dir.toUpperCase()}`
          )
          sql += ` ORDER BY ${orderClauses.join(", ")}`
        }

        sql += ` LIMIT ?`
        params.push(take ?? 100)

        if (skip) {
          sql += ` OFFSET ?`
          params.push(skip)
        }

        const records = await ds.exec2(sql, params)
        console.log("[tool:queryRecords] ✔", { returned: records.length })
        return { records, total: records.length }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[tool:queryRecords] ✖", msg)
        return { error: msg }
      }
    },
  }

  // ── createRecords (uses ds.createRecords) ──────────────────────────────
  const createRecordsParams = z.object({
    table_id: z.string().describe("The table ID"),
    records: z
      .array(z.record(z.any()))
      .min(1)
      .describe(
        "Array of records to create. Use column names as keys. The title column is required."
      ),
  })

  const createRecords: Tool = {
    description:
      "Create one or more records in a table. Use column names (from getTableSchema) as keys. Keep batch size ≤ 20.",
    inputSchema: createRecordsParams,
    execute: async (args) => {
      const { table_id, records } = args as z.infer<typeof createRecordsParams>
      console.log("[tool:createRecords] ▶", {
        table_id,
        count: records.length,
      })
      try {
        const created = await ds.createRecords(table_id, records)
        console.log("[tool:createRecords] ✔", {
          created: Array.isArray(created) ? created.length : records.length,
        })
        return {
          created,
          count: Array.isArray(created) ? created.length : records.length,
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[tool:createRecords] ✖", msg)
        return { error: msg }
      }
    },
  }

  // ── updateRecords (uses ds.setRow) ─────────────────────────────────────
  const updateRecordsParams = z.object({
    table_id: z.string().describe("The table ID"),
    records: z
      .array(
        z.object({ _id: z.string().describe("Record ID") }).catchall(z.any())
      )
      .min(1)
      .describe(
        "Records to update. Each must include _id and fields to change."
      ),
  })

  const updateRecords: Tool = {
    description:
      "Update one or more records by _id. Include _id and the fields to update in each record object.",
    inputSchema: updateRecordsParams,
    execute: async (args) => {
      const { table_id, records } = args as z.infer<typeof updateRecordsParams>
      console.log("[tool:updateRecords] ▶", {
        table_id,
        count: records.length,
      })
      try {
        const updated: any[] = []
        for (const record of records) {
          const { _id, ...data } = record
          await ds.setRow(table_id, _id, data)
          updated.push({ _id, ...data })
        }
        console.log("[tool:updateRecords] ✔", { updated: updated.length })
        return { updated, count: updated.length }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[tool:updateRecords] ✖", msg)
        return { error: msg }
      }
    },
  }

  // ── deleteRecords (uses raw SQL) ───────────────────────────────────────
  const deleteRecordsParams = z.object({
    table_id: z.string().describe("The table ID"),
    record_ids: z
      .array(z.string())
      .min(1)
      .describe("Array of record _id values to delete"),
  })

  const deleteRecords: Tool = {
    description: "Delete one or more records from a table by their _id.",
    inputSchema: deleteRecordsParams,
    execute: async (args) => {
      const { table_id, record_ids } = args as z.infer<
        typeof deleteRecordsParams
      >
      console.log("[tool:deleteRecords] ▶", {
        table_id,
        count: record_ids.length,
      })
      try {
        const rawTableName = `tb_${table_id}`
        const placeholders = record_ids.map(() => "?").join(",")
        await ds.exec2(
          `DELETE FROM "${rawTableName}" WHERE "_id" IN (${placeholders})`,
          record_ids
        )
        console.log("[tool:deleteRecords] ✔", { deleted: record_ids.length })
        return { deleted: record_ids.length }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[tool:deleteRecords] ✖", msg)
        return { error: msg }
      }
    },
  }

  return {
    listTables,
    getTableSchema,
    createTable,
    deleteTable,
    addField,
    queryRecords,
    createRecords,
    updateRecords,
    deleteRecords,
  }
}
