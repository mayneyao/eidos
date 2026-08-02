import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  EidosFileRuntime,
  validateEidosFile,
} from "../../../packages/eidos-file/dist/index.mjs"

class WasmConnection {
  capabilities = {
    int64: true,
    json1: true,
    returning: true,
    interrupt: true,
    scalarFunctions: true,
  }
  transactionDepth = 0

  constructor(database, sqlite) {
    this.database = database
    this.sqlite = sqlite
  }

  exec(sql) {
    this.database.exec(sql)
  }

  query(sql, params = []) {
    return this.database.selectObjects(sql, params)
  }

  get(sql, params = []) {
    return this.query(sql, params)[0]
  }

  run(sql, params = []) {
    const statement = this.database.prepare(sql)
    try {
      if (params.length > 0) statement.bind(params)
      statement.step()
    } finally {
      statement.finalize()
    }
    return {
      changes: this.database.changes(),
      lastInsertRowid:
        this.database.selectValue("SELECT last_insert_rowid()") ?? 0,
    }
  }

  runMany(sql, parameterSets) {
    const statement = this.database.prepare(sql)
    try {
      for (const params of parameterSets) {
        statement.bind(params).step()
        statement.reset(true)
      }
    } finally {
      statement.finalize()
    }
  }

  registerFunction(name, operation, arity = operation.length) {
    this.database.createFunction(
      name,
      (_context, ...values) => operation(...values),
      { arity, deterministic: true }
    )
  }

  transaction(operation) {
    const depth = this.transactionDepth++
    const savepoint = `eidos_feature_lab_verify_${depth}`
    this.database.exec(
      depth === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${savepoint}`
    )
    try {
      const result = operation()
      this.database.exec(depth === 0 ? "COMMIT" : `RELEASE ${savepoint}`)
      return result
    } catch (error) {
      this.database.exec(
        depth === 0
          ? "ROLLBACK"
          : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`
      )
      throw error
    } finally {
      this.transactionDepth -= 1
    }
  }

  dataVersion() {
    return this.get("PRAGMA data_version")?.data_version ?? 0
  }

  interrupt() {
    this.sqlite.capi.sqlite3_interrupt(this.database.pointer)
  }

  close() {
    this.database.close()
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`Feature Lab verification failed: ${message}`)
}

function assertSet(actual, expected, message) {
  const left = [...new Set(actual)].sort()
  const right = [...new Set(expected)].sort()
  assert(JSON.stringify(left) === JSON.stringify(right), `${message}: ${left}`)
}

function mutableDatabaseFromBytes(sqlite, bytes) {
  const database = new sqlite.oo1.DB(":memory:", "c")
  const capacity = bytes.byteLength + 4 * 1024 * 1024
  const pointer = sqlite.wasm.alloc(capacity)
  let ownedByDatabase = false
  try {
    sqlite.wasm.heap8u().set(bytes, pointer)
    database.checkRc(
      sqlite.capi.sqlite3_deserialize(
        database.pointer,
        "main",
        pointer,
        bytes.byteLength,
        capacity,
        sqlite.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
          sqlite.capi.SQLITE_DESERIALIZE_RESIZEABLE
      )
    )
    ownedByDatabase = true
    return database
  } finally {
    if (!ownedByDatabase) {
      sqlite.wasm.dealloc(pointer)
      database.close()
    }
  }
}

function fieldMap(runtime, tableId) {
  return new Map(
    runtime.listFields(tableId).map((field) => [field.name, field])
  )
}

function required(map, name) {
  const value = map.get(name)
  assert(value, `missing ${name}`)
  return value
}

function verifyEnglish(runtime, connection) {
  const tables = runtime.listTables()
  assertSet(
    tables.map((table) => table.name),
    ["Experiments", "People", "Programs", "x__Reference"],
    "English tables"
  )
  const experiments = tables.find((table) => table.name === "Experiments")
  const people = tables.find((table) => table.name === "People")
  const reference = tables.find((table) => table.name === "x__Reference")
  assert(experiments && people && reference, "English business tables exist")
  assert(runtime.countRows(experiments.id) === 180, "pagination data exists")
  assert(runtime.countRows(people.id) === 12, "Relation targets exist")
  assert(
    reference.physicalName === reference.name,
    "user Table display and physical names are identical"
  )

  const fields = fieldMap(runtime, experiments.id)
  for (const name of [
    "Experiment",
    "Summary",
    "Budget",
    "Progress",
    "Samples",
    "Stage",
    "Signals",
    "Approved",
    "Confidence",
    "Website",
    "Start date",
    "Review at",
    "Assets",
    "Payload",
  ]) {
    required(fields, name)
  }
  assert(
    required(fields, "Confidence").settings?.display?.kind === "rating",
    "Rating is persisted as an Integer presentation alias"
  )
  assertSet(
    connection
      .query(
        `SELECT DISTINCT type FROM eidos__fields
          WHERE system_role IS NULL ORDER BY type`
      )
      .map((row) => row.type),
    [
      "checkbox",
      "date",
      "datetime",
      "file",
      "formula",
      "integer",
      "json",
      "lookup",
      "multi-select",
      "number",
      "relation",
      "select",
      "text",
      "url",
    ],
    "canonical Field storage types"
  )

  const relations = [...fields.values()].filter(
    (field) => field.type === "relation"
  )
  assertSet(
    relations.map((field) => field.property?.cardinality),
    ["many", "one"],
    "single and multiple forward Relations"
  )
  assertSet(
    connection
      .query("SELECT DISTINCT direction FROM eidos__relation_fields")
      .map((row) => row.direction),
    ["forward", "inverse"],
    "forward and inverse Relation definitions"
  )
  assertSet(
    connection
      .query(
        "SELECT DISTINCT on_delete FROM eidos__relation_fields WHERE direction='forward'"
      )
      .map((row) => row.on_delete),
    ["detach", "preserve", "restrict"],
    "Relation deletion policies"
  )

  assertSet(
    connection
      .query("SELECT aggregate FROM eidos__lookup_fields")
      .map((row) => row.aggregate),
    ["average", "count", "first", "max", "min", "sum", "values"],
    "Lookup aggregates"
  )
  assertSet(
    connection
      .query("SELECT result_type FROM eidos__formula_fields")
      .map((row) => row.result_type),
    [
      "checkbox",
      "date",
      "datetime",
      "integer",
      "json",
      "number",
      "text",
      "url",
    ],
    "Formula result types"
  )

  const views = runtime.listViews(experiments.id)
  assertSet(
    views.map((view) => view.type),
    ["gallery", "grid", "kanban"],
    "core View types"
  )
  const ready = views.find((view) => view.name === "Ready queue")
  assert(
    ready?.filter?.children.length === 2 && ready.sorts.length === 2,
    "saved filters and multi-field sorts"
  )
  const board = views.find((view) => view.name === "By stage")
  assert(
    board?.properties?.groupField === required(fields, "Stage").id &&
      board.properties?.coverFit === "contain" &&
      board.properties?.showEmptyGroups === false &&
      Array.isArray(board.properties?.cardFields),
    "saved Kanban-specific configuration"
  )
  const gallery = views.find((view) => view.name === "Lab gallery")
  assert(
    gallery?.properties?.coverFit === "contain" &&
      gallery.properties?.hideEmptyFields === false &&
      Array.isArray(gallery.properties?.cardFields) &&
      gallery.properties.cardFields.includes(
        required(fields, "Collaborators").id
      ),
    "saved Gallery-specific configuration"
  )
  const grid = views.find((view) => view.name === "Grid")
  assert(
    Object.keys(grid?.properties?.columnStats ?? {}).length === 4 &&
      grid?.properties?.freezeColumns === 2 &&
      grid.properties?.rowDensity === "compact" &&
      !grid.hiddenFields.includes(required(fields, "Assets").id),
    "saved Grid configuration and visible File Field"
  )

  const owner = required(fields, "Owner")
  const first = runtime.queryRows(experiments.id, {
    query: { search: "Feature Lab launch" },
    limit: 1,
    resolveRelations: true,
  }).rows[0]
  assert(first, "first feature record is queryable")
  assert(
    first.resolved?.[owner.id]?.[0]?.label === "Avery Chen",
    "Relation resolves a human-readable Record Label"
  )
  assert(
    Array.isArray(first.fields[required(fields, "Contributor names").id]) &&
      first.fields[required(fields, "Contributor names").id].join(", ") ===
        "Mina Park, Theo Martin",
    "values Lookup preserves ordered labels"
  )
  assert(
    Number(first.fields[required(fields, "Owner allocation").id]) === 40 &&
      Number(first.fields[required(fields, "Contributor count").id]) === 2 &&
      Number(first.fields[required(fields, "Relation-backed load").id]) === 42,
    "Lookup and Formula dependency chain evaluates"
  )
  assert(
    Math.abs(
      Number(first.fields[required(fields, "Weighted budget").id]) - 100_000.4
    ) < 0.001,
    "Number Formula evaluates"
  )
  assert(
    first.fields[required(fields, "Next review").id] === "2026-01-15" &&
      first.fields[required(fields, "Follow-up at").id] ===
        "2026-01-01T10:00:00.000Z",
    "date and datetime Formulas evaluate"
  )
  assert(
    Array.isArray(first.fields[required(fields, "Assets").id]) &&
      first.fields[required(fields, "Assets").id].length === 2,
    "File values decode"
  )
  const payloadMirror = first.fields[required(fields, "Payload mirror").id]
  const decodedPayloadMirror =
    typeof payloadMirror === "string"
      ? JSON.parse(payloadMirror)
      : payloadMirror
  assert(
    decodedPayloadMirror?.nested?.exactInteger === "9223372036854775807",
    "JSON Formula preserves exact-integer strings"
  )
}

function verifyChinese(runtime) {
  const tables = runtime.listTables()
  assertSet(
    tables.map((table) => table.name),
    ["x__参考目录", "人员", "实验", "计划"],
    "Chinese tables"
  )
  const experiments = tables.find((table) => table.name === "实验")
  assert(experiments, "Chinese Experiment table exists")
  const fields = fieldMap(runtime, experiments.id)
  const owner = required(fields, "负责人")
  const first = runtime.queryRows(experiments.id, {
    query: { search: "全功能实验室启动" },
    limit: 1,
    resolveRelations: true,
  }).rows[0]
  assert(
    first?.resolved?.[owner.id]?.[0]?.label === "Avery Chen",
    "localized Relation still resolves a readable label"
  )
  assert(
    Number(first?.fields[required(fields, "关联派生负载").id]) === 42,
    "localized Formula references were rewritten"
  )
  assertSet(
    runtime.listViews(experiments.id).map((view) => view.type),
    ["gallery", "grid", "kanban"],
    "localized core Views"
  )
}

function verifyFixture(sqlite, fileName, locale) {
  const directory = path.dirname(fileURLToPath(import.meta.url))
  const filePath = path.resolve(directory, "../fixtures", fileName)
  const bytes = fs.readFileSync(filePath)
  const database = mutableDatabaseFromBytes(sqlite, bytes)
  const connection = new WasmConnection(database, sqlite)
  try {
    const validation = validateEidosFile(connection, { level: "full" })
    assert(
      validation.valid,
      `${fileName} validates: ${validation.errors
        .map((issue) => issue.message)
        .join("; ")}`
    )
    assert(
      connection.get("PRAGMA integrity_check")?.integrity_check === "ok",
      `${fileName} passes integrity_check`
    )
    const runtime = new EidosFileRuntime(connection)
    if (locale === "en") verifyEnglish(runtime, connection)
    else verifyChinese(runtime)
    return {
      bytes: bytes.byteLength,
      fileName,
      revision: Number(runtime.metadata().revision),
      tables: runtime.listTables().length,
    }
  } finally {
    connection.close()
  }
}

const sqlitePackageEntry = import.meta.resolve("@sqlite.org/sqlite-wasm")
const sqliteNodeModule = new URL(
  "./sqlite-wasm/jswasm/sqlite3-node.mjs",
  sqlitePackageEntry
)
const { default: sqlite3InitModule } = await import(sqliteNodeModule.href)
const sqlite = await sqlite3InitModule({
  print: () => undefined,
  printErr: console.error,
})

const verified = [
  verifyFixture(sqlite, "feature-lab.eidos", "en"),
  verifyFixture(sqlite, "feature-lab.zh.eidos", "zh"),
]
console.log(JSON.stringify({ verified }, null, 2))
