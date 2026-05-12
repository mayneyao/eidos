import type { DataSpace } from "@/packages/core/data-space"
import type { Bash } from "just-bash"
import { getRawTableNameById } from "@/lib/utils"
import { FieldType } from "@/packages/core/fields/const"
import { parseArgs } from "./utils"

const normalizeTableId = (id: string) => {
  if (!id) return id
  return id.startsWith("tb_") ? id.slice(3) : id
}

const CONVERTIBLE_TYPES = new Set<string>([
  FieldType.Text,
  FieldType.Number,
  FieldType.Checkbox,
  FieldType.Date,
  FieldType.URL,
  FieldType.Rating,
  FieldType.File,
  FieldType.Select,
  FieldType.MultiSelect,
])

type ExecResult = { exitCode: number; stdout: string; stderr: string }

// ── subcommand handlers ──────────────────────────────────────────────────

async function tableCreate(ds: DataSpace, args: string[]): Promise<ExecResult> {
  const name = args[0]
  if (!name)
    return {
      exitCode: 1,
      stdout: "",
      stderr: "Usage: eidos table create <name>",
    }
  if (name.startsWith("-")) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Invalid table name "${name}". Did you mean to use a positional argument? Usage: eidos table create <name>`,
    }
  }
  if (!/^[a-zA-Z_]/.test(name)) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Invalid table name "${name}". Table names must start with a letter or underscore.`,
    }
  }
  const res = await ds.schema.createTable({ name, fields: [] })
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      id: res.id,
      name: res.name,
      hint: "Table created. Add columns with 'eidos column create', then insert records with 'eidos record insert'.",
    }),
    stderr: "",
  }
}

async function tableDelete(ds: DataSpace, args: string[]): Promise<ExecResult> {
  const tableId = normalizeTableId(args[0])
  if (!tableId)
    return {
      exitCode: 1,
      stdout: "",
      stderr: "Usage: eidos table delete <table_id>",
    }
  await ds.schema.deleteTable(tableId)
  return { exitCode: 0, stdout: "Table deleted successfully", stderr: "" }
}

async function columnCreate(
  ds: DataSpace,
  args: string[]
): Promise<ExecResult> {
  const { positionals, flags } = parseArgs(args)
  const tableId = normalizeTableId(positionals[0])
  const name = positionals[1]
  const type = positionals[2]

  if (!tableId || !name || !type) {
    return {
      exitCode: 1,
      stdout: "",
      stderr:
        "Usage: eidos column create <table_id> <name> <type> [--property json]\n" +
        '  select/multi-select: {"options": [{"name": "Done", "color": "green"}]}\n' +
        '  number: {"format": "currency", "showAs": "bar"}\n' +
        '  formula: {"formula": "price * quantity", "displayType": "number"}  — SQLite GENERATED ALWAYS AS (<formula>)\n' +
        '  link: {"linkTableName": "...", "linkColumnName": "..."}\n' +
        '  text: {"enableEmbedding": true}',
    }
  }

  let property: Record<string, any> | undefined
  if (flags.property) {
    try {
      property = JSON.parse(flags.property)
    } catch {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Invalid JSON for --property: ${flags.property}`,
      }
    }
  }

  const columnName = name.toLowerCase().replace(/[^a-z0-9]/g, "_")
  const result = await ds.schema.addField(tableId, {
    name,
    columnName,
    type: type as any,
    property,
  })
  return { exitCode: 0, stdout: JSON.stringify(result), stderr: "" }
}

async function columnUpdate(
  ds: DataSpace,
  args: string[]
): Promise<ExecResult> {
  const { positionals, flags } = parseArgs(args)
  const tableId = normalizeTableId(positionals[0])
  const columnName = positionals[1]

  if (!tableId || !columnName) {
    return {
      exitCode: 1,
      stdout: "",
      stderr:
        "Usage: eidos column update <table_id> <column_name> [--name new_name] [--type new_type] [--property json]\n" +
        "\n" +
        "--property format by field type (values are merged with existing):\n" +
        '  select/multi-select: {"options": [{"name": "...", "color": "..."}]}\n' +
        '  number: {"format": "number"|"percent"|"currency", "showAs": "number"|"bar"|"ring"}\n' +
        '  formula: {"formula": "price * quantity", "displayType": "number", "numberConfig": {...}}\n' +
        "    - SQLite generated-column expression: GENERATED ALWAYS AS (<formula>). Use SQLite syntax (|| for concat, CAST for types).\n" +
        "    - Reference columns by table_column_name (lowercase, underscores).\n" +
        "    - displayType: text, number, date, datetime, checkbox, select, multi-select, url, rating, file\n" +
        '    - When displayType=select/multi-select, use optionConfig (NOT options): {"optionConfig": {"colorMap": [{"value": "...", "color": "..."}]}}\n' +
        '  link: {"linkTableName": "...", "linkColumnName": "..."}\n' +
        '  lookup: {"linkFieldId": "...", "lookupTargetFieldId": "..."}\n' +
        '  text: {"enableEmbedding": true}\n' +
        '  file: {"proxyUrl": "..."}\n' +
        "  checkbox/date/datetime/rating/url/title: {} (no properties)\n" +
        "\n" +
        "--type allowed values: text, number, checkbox, date, datetime, url, rating, file, select, multi-select",
    }
  }

  if (!flags.name && !flags.type && !flags.property) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "At least one of --name, --type, or --property is required",
    }
  }

  const rawTableName = getRawTableNameById(tableId)
  const existingField = await ds.column.getColumn(rawTableName, columnName)
  if (!existingField) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Field not found: ${columnName} in table ${tableId}`,
    }
  }

  if (flags.type) {
    if (!CONVERTIBLE_TYPES.has(flags.type)) {
      const hint =
        flags.type === FieldType.Formula
          ? `\nHint: Cannot convert to formula directly. First create a text/number field, then update its property with: --property '{"formula": "expression"}'`
          : ""
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Type "${flags.type}" is not convertible via --type. Allowed types: ${[...CONVERTIBLE_TYPES].join(", ")}${hint}`,
      }
    }
    await ds.column.changeType(
      rawTableName,
      columnName,
      flags.type as FieldType
    )
  }

  if (flags.property) {
    let property: Record<string, any>
    try {
      property = JSON.parse(flags.property)
    } catch {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Invalid JSON for --property: ${flags.property}`,
      }
    }
    const currentField = await ds.column.getColumn(rawTableName, columnName)
    const mergedProperty = { ...(currentField?.property ?? {}), ...property }
    await ds.schema.updateField(tableId, columnName, {
      property: mergedProperty,
    })
  }

  if (flags.name) {
    await ds.schema.updateField(tableId, columnName, { name: flags.name })
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
}

async function recordQuery(ds: DataSpace, args: string[]): Promise<ExecResult> {
  const { positionals, flags } = parseArgs(args)
  const tableId = normalizeTableId(positionals[0])
  if (!tableId) {
    return {
      exitCode: 1,
      stdout: "",
      stderr:
        "Usage: eidos record query <table_id> [--where json] [--take 100] [--skip 0] [--orderBy json]",
    }
  }

  const where = flags.where ? JSON.parse(flags.where) : undefined
  const orderBy = flags.orderBy ? JSON.parse(flags.orderBy) : undefined
  const take = flags.take ? parseInt(flags.take, 10) : 100
  const skip = flags.skip ? parseInt(flags.skip, 10) : 0

  const res = await ds.table(tableId).findMany({ where, orderBy, take, skip })
  return { exitCode: 0, stdout: JSON.stringify(res, null, 2), stderr: "" }
}

async function recordInsert(
  ds: DataSpace,
  args: string[],
  ctx: any
): Promise<ExecResult> {
  const tableId = normalizeTableId(args[0])
  if (!tableId)
    return {
      exitCode: 1,
      stdout: "",
      stderr: "Usage: eidos record insert <table_id>",
    }
  if (!ctx.stdin)
    return {
      exitCode: 1,
      stdout: "",
      stderr: "Missing stdin. Pipe JSON array to this command.",
    }

  const records = JSON.parse(ctx.stdin.trim() || "[]")
  if (!Array.isArray(records))
    return {
      exitCode: 1,
      stdout: "",
      stderr: "stdin must be a JSON array of records",
    }

  const res = await ds.table(tableId).createMany({ data: records })
  return {
    exitCode: 0,
    stdout: JSON.stringify({ count: res.count }),
    stderr: "",
  }
}

async function recordUpdate(
  ds: DataSpace,
  args: string[],
  ctx: any
): Promise<ExecResult> {
  const tableId = normalizeTableId(args[0])
  if (!tableId)
    return {
      exitCode: 1,
      stdout: "",
      stderr: "Usage: eidos record update <table_id>",
    }
  if (!ctx.stdin)
    return {
      exitCode: 1,
      stdout: "",
      stderr:
        "Missing stdin. Pipe JSON array of {where, data} to this command.",
    }

  const updates = JSON.parse(ctx.stdin.trim() || "[]")
  if (!Array.isArray(updates))
    return {
      exitCode: 1,
      stdout: "",
      stderr: "stdin must be a JSON array of {where, data}",
    }

  let total = 0
  for (const op of updates) {
    const res = await ds
      .table(tableId)
      .updateMany({ where: op.where, data: op.data })
    total += res.count
  }
  return { exitCode: 0, stdout: JSON.stringify({ count: total }), stderr: "" }
}

async function recordDelete(
  ds: DataSpace,
  args: string[],
  ctx: any
): Promise<ExecResult> {
  const { positionals, flags } = parseArgs(args)
  const tableId = normalizeTableId(positionals[0])
  if (!tableId) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "Usage: eidos record delete <table_id> [--where json]",
    }
  }

  const whereJson = flags.where ? flags.where : ctx.stdin
  if (!whereJson)
    return {
      exitCode: 1,
      stdout: "",
      stderr: "Missing where condition. Use --where or pipe it.",
    }

  const where = JSON.parse(whereJson.trim() || "{}")
  const res = await ds.table(tableId).deleteMany({ where })
  return {
    exitCode: 0,
    stdout: JSON.stringify({ count: res.count }),
    stderr: "",
  }
}

// ── router ────────────────────────────────────────────────────────────────

const USAGE = `eidos <resource> <action> [args...]

Resources & actions:
  eidos table create <name>
  eidos table delete <table_id>
  eidos column create <table_id> <name> <type> [--property json]
  eidos column update <table_id> <column_name> [--name] [--type] [--property]
  eidos record query <table_id> [--where json] [--take 100] [--skip 0] [--orderBy json]
  eidos record insert <table_id>       (stdin: JSON array of records)
  eidos record update <table_id>       (stdin: JSON array of {where, data})
  eidos record delete <table_id>       [--where json]

--property format by field type (values are merged with existing):
  select/multi-select: {"options": [{"name": "...", "color": "..."}]}  — uses options, NOT optionConfig!
  number:             {"format": "number"|"percent"|"currency", "showAs": "number"|"bar"|"ring"}
  formula:            {"formula": "price * quantity", "displayType": "number", "numberConfig": {...}}
    - Stored as a SQLite generated column: GENERATED ALWAYS AS (<formula>). Must be valid SQLite SQL.
    - Reference columns by table_column_name (lowercase, underscores) — NOT the display name.
    - String concat uses || (not +). Cast: CAST(expr AS TEXT|INTEGER|REAL). Common fns: UPPER, LOWER, COALESCE, SUBSTR, REPLACE.
    - displayType: text, number, date, datetime, checkbox, select, multi-select, url, rating, file
    - displayType=select/multi-select uses optionConfig (NOT options): {"optionConfig": {"colorMap": [{"value": "...", "color": "..."}]}}
  link:               {"linkTableName": "...", "linkColumnName": "..."}
  lookup:             {"linkFieldId": "...", "lookupTargetFieldId": "..."}
  text:               {"enableEmbedding": true}
  file:               {"proxyUrl": "..."}
  checkbox/date/datetime/rating/url: {} (no configurable properties)

--type allowed values: text, number, checkbox, date, datetime, url, rating, file, select, multi-select`

export function registerTableCommands(bash: Bash, ds: DataSpace) {
  bash.registerCommand({
    name: "eidos",
    trusted: true,
    execute: async (args: string[], ctx?: any) => {
      try {
        const resource = args[0]
        const action = args[1]
        const rest = args.slice(2)

        if (!resource || !action) {
          return { exitCode: 1, stdout: "", stderr: USAGE }
        }

        switch (`${resource} ${action}`) {
          case "table create":
            return tableCreate(ds, rest)
          case "table delete":
            return tableDelete(ds, rest)
          case "column create":
            return columnCreate(ds, rest)
          case "column update":
            return columnUpdate(ds, rest)
          case "record query":
            return recordQuery(ds, rest)
          case "record insert":
            return recordInsert(ds, rest, ctx)
          case "record update":
            return recordUpdate(ds, rest, ctx)
          case "record delete":
            return recordDelete(ds, rest, ctx)
          default:
            return {
              exitCode: 1,
              stdout: "",
              stderr: `Unknown: eidos ${resource} ${action}\n\n${USAGE}`,
            }
        }
      } catch (err: any) {
        return { exitCode: 1, stdout: "", stderr: err.message || String(err) }
      }
    },
  })
}
