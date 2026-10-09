import type {
  EidosFileRow,
  EidosFileTableSnapshot,
} from "@eidos.space/eidos-file"

/** Resolve a mapped file relative to the metadata file, never to the UI cwd. */
export function fileMetadataRowPath(
  table: EidosFileTableSnapshot,
  row: EidosFileRow,
  metadataPath: string
): string | null {
  if (table.table.settings?.vtabModule !== "fs_meta") return null
  const field = table.fields.find(
    (field) => field.name === "path" && field.settings?.isSystem === true
  )
  const path = field ? row[field.tableColumnName] : null
  const configuration = table.table.settings.vtabConfig
  const root =
    configuration &&
    typeof configuration === "object" &&
    !Array.isArray(configuration)
      ? (configuration as Record<string, unknown>).root
      : "."
  if (typeof path !== "string" || typeof root !== "string" || !path) return null
  const portable = (value: string) =>
    !value.startsWith("/") &&
    !/[\\\u0000-\u001f]/u.test(value) &&
    !/^[a-z]:/iu.test(value) &&
    !value.split("/").includes("..")
  if (![path, root, metadataPath].every(portable)) return null
  const directory = metadataPath.split("/").slice(0, -1)
  return (
    [...directory, ...root.split("/"), ...path.split("/")]
      .filter((part) => part && part !== ".")
      .join("/") || null
  )
}
