import type { DataSpace } from "@/packages/core/data-space"
import { getRawTableNameById } from "@/lib/utils"
import { FieldType } from "@/packages/core/fields/const"
import type { ViewType } from "@/packages/core/types/IView"

export type ExecResult = { exitCode: number; stdout: string; stderr: string }

export const normalizeTableId = (id: string) => {
  if (!id) return id
  return id.startsWith("tb_") ? id.slice(3) : id
}

export const CONVERTIBLE_TYPES = new Set<string>([
  FieldType.Text,
  FieldType.Number,
  FieldType.Checkbox,
  FieldType.Date,
  // FieldType.DateTime,
  FieldType.URL,
  FieldType.Rating,
  FieldType.File,
  FieldType.Select,
  FieldType.MultiSelect,
])

function normalizeColumnProperty(type: string, property: any): any {
  if (!property) return property
  if (
    (type === FieldType.Select || type === FieldType.MultiSelect) &&
    Array.isArray(property.options)
  ) {
    const normalizedOptions: any[] = []
    const allColors = [
      "default",
      "gray",
      "brown",
      "pink",
      "red",
      "orange",
      "yellow",
      "green",
      "cyan",
      "blue",
      "purple",
    ]
    property.options.forEach((opt: any, index: number) => {
      if (!opt || typeof opt !== "object") return
      const name = opt.name || ""
      const id = opt.id || name
      const color = opt.color || allColors[index % allColors.length]
      normalizedOptions.push({ id, name, color })
    })
    property.options = normalizedOptions
  }
  return property
}

/**
 * Generic wrapper to catch SQLite "no such table" errors.
 */
async function wrapDbCall(
  tableId: string,
  fn: () => Promise<ExecResult>
): Promise<ExecResult> {
  try {
    return await fn()
  } catch (err: any) {
    if (err.message?.includes("no such table")) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Error: Table not found (no such table: tb_${tableId}).
Did you pass the table name ("${tableId}") instead of the table ID?
Hint: All subcommands require the 32-character hexadecimal table ID (e.g., 99ea583e0160490787664c63b829d89a) rather than the display name.
Run 'eidos table list' to see available tables and their IDs.`,
      }
    }
    throw err
  }
}

/**
 * Walk a JSON value and convert boolean true/false to 1/0 for SQLite.
 */
function normalizeBooleans(v: any): any {
  if (v === true) return 1
  if (v === false) return 0
  if (Array.isArray(v)) return v.map(normalizeBooleans)
  if (v && typeof v === "object") {
    const out: Record<string, any> = {}
    for (const [k, val] of Object.entries(v)) {
      out[k] = normalizeBooleans(val)
    }
    return out
  }
  return v
}

export async function tableCreate(
  ds: DataSpace,
  name: string
): Promise<ExecResult> {
  const res = await ds.schema.createTable({ name, fields: [] })
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      id: res.id,
      name: res.name,
      hint: `Table created successfully.
To add columns, run:
  eidos column create ${res.id} <column_name> <type>
To insert records, run:
  eidos record insert ${res.id} --data '{"title": "Example"}'
CRITICAL: You MUST use the table ID '${res.id}' (NOT the table name '${res.name}') for all subsequent subcommands.`,
    }),
    stderr: "",
  }
}

export async function tableDelete(
  ds: DataSpace,
  tableId: string
): Promise<ExecResult> {
  return wrapDbCall(tableId, async () => {
    const normalized = normalizeTableId(tableId)
    await ds.schema.deleteTable(normalized)
    return { exitCode: 0, stdout: "Table deleted successfully", stderr: "" }
  })
}

export async function columnCreate(
  ds: DataSpace,
  tableId: string,
  name: string,
  type: string,
  propertyStr?: string
): Promise<ExecResult> {
  return wrapDbCall(tableId, async () => {
    const normalizedTableId = normalizeTableId(tableId)
    let property = propertyStr ? JSON.parse(propertyStr) : undefined
    property = normalizeColumnProperty(type, property)
    const columnName = name.toLowerCase().replace(/[^a-z0-9]/g, "_")
    const result = await ds.schema.addField(normalizedTableId, {
      name,
      columnName,
      type: type as any,
      property,
    })
    return { exitCode: 0, stdout: JSON.stringify(result), stderr: "" }
  })
}

export async function columnDelete(
  ds: DataSpace,
  tableId: string,
  columnName: string
): Promise<ExecResult> {
  return wrapDbCall(tableId, async () => {
    const normalizedTableId = normalizeTableId(tableId)
    const rawTableName = getRawTableNameById(normalizedTableId)
    const existingField = await ds.column.getColumn(rawTableName, columnName)
    if (!existingField) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Field not found: ${columnName} in table ${tableId}`,
      }
    }
    await ds.schema.deleteField(normalizedTableId, columnName)
    return { exitCode: 0, stdout: "Column deleted successfully", stderr: "" }
  })
}

export async function columnUpdate(
  ds: DataSpace,
  tableId: string,
  columnName: string,
  name?: string,
  type?: string,
  propertyStr?: string
): Promise<ExecResult> {
  return wrapDbCall(tableId, async () => {
    const normalizedTableId = normalizeTableId(tableId)
    const rawTableName = getRawTableNameById(normalizedTableId)
    const existingField = await ds.column.getColumn(rawTableName, columnName)
    if (!existingField) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Field not found: ${columnName} in table ${tableId}`,
      }
    }

    if (type) {
      if (!CONVERTIBLE_TYPES.has(type)) {
        const hint =
          type === FieldType.Formula
            ? `\nHint: Cannot convert to formula directly. First create a text/number field, then update its property with: --property '{"formula": "expression"}'`
            : ""
        return {
          exitCode: 1,
          stdout: "",
          stderr: `Type "${type}" is not convertible via --type. Allowed types: ${[...CONVERTIBLE_TYPES].join(", ")}${hint}`,
        }
      }
      await ds.column.changeType(rawTableName, columnName, type as FieldType)
    }

    if (propertyStr) {
      let property = JSON.parse(propertyStr)
      const currentField = await ds.column.getColumn(rawTableName, columnName)
      const fieldType = type || currentField?.type || ""
      property = normalizeColumnProperty(fieldType, property)
      const mergedProperty = { ...(currentField?.property ?? {}), ...property }
      await ds.schema.updateField(normalizedTableId, columnName, {
        property: mergedProperty,
      })
    }

    if (name) {
      await ds.schema.updateField(normalizedTableId, columnName, { name })
    }

    const updatedField = await ds.column.getColumn(rawTableName, columnName)
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        name: updatedField?.name,
        columnName: updatedField?.table_column_name,
        type: updatedField?.type,
        property: updatedField?.property,
      }),
      stderr: "",
    }
  })
}

export async function viewCreate(
  ds: DataSpace,
  tableId: string,
  name: string,
  type: string
): Promise<ExecResult> {
  return wrapDbCall(tableId, async () => {
    const normalizedTableId = normalizeTableId(tableId)
    const result = await ds.schema.createView(normalizedTableId, {
      name,
      type: type as ViewType,
    })
    return { exitCode: 0, stdout: JSON.stringify(result), stderr: "" }
  })
}

export async function viewList(
  ds: DataSpace,
  tableId: string
): Promise<ExecResult> {
  return wrapDbCall(tableId, async () => {
    const normalizedTableId = normalizeTableId(tableId)
    const views = await ds.schema.listViews(normalizedTableId)
    return { exitCode: 0, stdout: JSON.stringify(views), stderr: "" }
  })
}

export async function viewDelete(
  ds: DataSpace,
  tableId: string,
  viewId: string
): Promise<ExecResult> {
  return wrapDbCall(tableId, async () => {
    const normalizedTableId = normalizeTableId(tableId)
    await ds.schema.deleteView(normalizedTableId, viewId)
    return { exitCode: 0, stdout: "View deleted successfully", stderr: "" }
  })
}

export async function viewUpdate(
  ds: DataSpace,
  tableId: string,
  viewId: string,
  name?: string,
  type?: string,
  query?: string,
  propertyStr?: string
): Promise<ExecResult> {
  return wrapDbCall(tableId, async () => {
    const normalizedTableId = normalizeTableId(tableId)
    const input: Record<string, any> = {}
    if (name) input.name = name
    if (type) input.type = type
    if (query) input.query = query
    if (propertyStr) {
      input.properties = JSON.parse(propertyStr)
    }

    const result = await ds.schema.updateView(normalizedTableId, viewId, input)
    return { exitCode: 0, stdout: JSON.stringify(result), stderr: "" }
  })
}

export async function recordQuery(
  ds: DataSpace,
  tableId: string,
  query?: string,
  whereStr?: string,
  orderByStr?: string,
  take?: number,
  skip?: number
): Promise<ExecResult> {
  return wrapDbCall(tableId, async () => {
    const normalizedTableId = normalizeTableId(tableId)
    if (query) {
      const fixed = query.replace(
        new RegExp(`\\b${normalizedTableId}\\b`, "g"),
        `tb_${normalizedTableId}`
      )
      const res = await ds.exec2(fixed)
      return { exitCode: 0, stdout: JSON.stringify(res, null, 2), stderr: "" }
    }

    const where = whereStr ? JSON.parse(whereStr) : undefined
    const orderBy = orderByStr ? JSON.parse(orderByStr) : undefined
    const finalTake = take ?? 100
    const finalSkip = skip ?? 0

    const res = await ds
      .table(normalizedTableId)
      .findMany({ where, orderBy, take: finalTake, skip: finalSkip })
    return { exitCode: 0, stdout: JSON.stringify(res, null, 2), stderr: "" }
  })
}

export async function recordInsert(
  ds: DataSpace,
  tableId: string,
  ctx: any,
  dataStr?: string
): Promise<ExecResult> {
  const jsonSource = dataStr || ctx.stdin
  if (!jsonSource) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Error: Missing JSON input. You must provide data either via '--data' option or by piping JSON to stdin.
Example with --data:
  eidos record insert ${tableId} --data '{"title": "Example Record"}'
Example with pipe:
  echo '{"title": "Example Record"}' | eidos record insert ${tableId}`,
    }
  }
  return wrapDbCall(tableId, async () => {
    const normalizedTableId = normalizeTableId(tableId)
    const input = normalizeBooleans(JSON.parse(jsonSource.trim() || "[]"))
    const records = Array.isArray(input) ? input : [input]

    const res = await ds.table(normalizedTableId).createMany({ data: records })
    return {
      exitCode: 0,
      stdout: JSON.stringify({ count: res.count }),
      stderr: "",
    }
  })
}

export async function recordUpdate(
  ds: DataSpace,
  tableId: string,
  ctx: any,
  whereStr?: string,
  dataStr?: string
): Promise<ExecResult> {
  const normalizedTableId = normalizeTableId(tableId)

  // If inline where and data are provided
  if (whereStr && dataStr) {
    return wrapDbCall(tableId, async () => {
      const where = JSON.parse(whereStr.trim())
      const data = normalizeBooleans(JSON.parse(dataStr.trim()))
      const res = await ds.table(normalizedTableId).updateMany({ where, data })
      return {
        exitCode: 0,
        stdout: JSON.stringify({ count: res.count }),
        stderr: "",
      }
    })
  }

  // Fallback to stdin
  if (!ctx.stdin) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Error: Missing input. You must provide updates either via '--where' and '--data' options, or by piping JSON to stdin.
Example with options:
  eidos record update ${tableId} --where '{"id": "1"}' --data '{"status": "Done"}'
Example with pipe:
  echo '{"where": {"id": "1"}, "data": {"status": "Done"}}' | eidos record update ${tableId}`,
    }
  }

  return wrapDbCall(tableId, async () => {
    const input = normalizeBooleans(JSON.parse(ctx.stdin.trim() || "[]"))
    const updates = Array.isArray(input) ? input : [input]

    let total = 0
    for (const op of updates) {
      const res = await ds
        .table(normalizedTableId)
        .updateMany({ where: op.where, data: op.data })
      total += res.count
    }
    return { exitCode: 0, stdout: JSON.stringify({ count: total }), stderr: "" }
  })
}

export async function recordDelete(
  ds: DataSpace,
  tableId: string,
  ctx: any,
  whereStr?: string
): Promise<ExecResult> {
  const whereJson = whereStr ? whereStr : ctx.stdin
  if (!whereJson) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Error: Missing where condition. Use --where or pipe it.
Example: eidos record delete ${tableId} --where '{"id": "1"}'`,
    }
  }
  return wrapDbCall(tableId, async () => {
    const normalizedTableId = normalizeTableId(tableId)
    const where = JSON.parse(whereJson.trim() || "{}")
    const res = await ds.table(normalizedTableId).deleteMany({ where })
    return {
      exitCode: 0,
      stdout: JSON.stringify({ count: res.count }),
      stderr: "",
    }
  })
}

export async function tableList(ds: DataSpace): Promise<ExecResult> {
  try {
    const tables = await ds.schema.listTables()
    return {
      exitCode: 0,
      stdout: JSON.stringify(tables, null, 2),
      stderr: "",
    }
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function tableInfo(
  ds: DataSpace,
  tableId: string
): Promise<ExecResult> {
  return wrapDbCall(tableId, async () => {
    const normalized = normalizeTableId(tableId)
    const info = await ds.schema.getTable(normalized)
    return {
      exitCode: 0,
      stdout: JSON.stringify(info, null, 2),
      stderr: "",
    }
  })
}
