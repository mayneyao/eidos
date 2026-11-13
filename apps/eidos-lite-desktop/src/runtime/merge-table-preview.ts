import path from "node:path"
import { openEidosFile } from "@eidos.space/eidos-file/node-sqlite"
import type { EidosSyncMergeTablePreview } from "../shared/contracts"

function previewCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  const text =
    typeof value === "string"
      ? value
      : typeof value === "bigint"
        ? value.toString()
        : JSON.stringify(value, (_key, item: unknown) =>
            typeof item === "bigint" ? item.toString() : item
          )
  return text.length > 512 ? `${text.slice(0, 512)}…` : text
}

/** Open only the exported immutable input. Canonical Runtime owns logical fields and values. */
export function readMergeTablePreview(
  filePath: string,
  tableNames: readonly string[]
): EidosSyncMergeTablePreview[] {
  if (!path.isAbsolute(filePath))
    throw new Error("Merge preview path must be absolute")
  const runtime = openEidosFile(filePath, { readonly: true })
  try {
    return runtime
      .listTables()
      .filter(
        (table) =>
          tableNames.length === 0 ||
          tableNames.some((name) =>
            [
              table.id,
              table.name,
              table.physicalName,
              table.rawTableName,
            ].includes(name)
          )
      )
      .slice(0, 16)
      .map((table) => {
        const allFields = runtime
          .listFields(table.id)
          .filter((field) => !field.systemRole)
        const fields = allFields.slice(0, 64)
        const page = runtime.queryRows(table.id, {
          fields: fields.map((field) => field.id),
          limit: 7,
        })
        return {
          id: table.id,
          name: table.name,
          fields: fields.map(({ id, name, type }) => ({ id, name, type })),
          rows: page.rows.slice(0, 6).map((row) => ({
            id: row.id,
            cells: fields.map((field) => previewCell(row.fields[field.id])),
          })),
          hasMoreRows: page.rows.length > 6,
          hasMoreFields: allFields.length > fields.length,
        }
      })
  } finally {
    runtime.close()
  }
}
