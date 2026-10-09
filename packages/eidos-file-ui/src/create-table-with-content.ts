import type {
  CreateEidosFileTableInput,
  EidosFileDataSource,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"

/** Compose canonical table creation and table-level Content Field settings. */
export async function createEidosFileTableWithContent(
  source: EidosFileDataSource,
  input: CreateEidosFileTableInput,
  contentFieldName?: string
): Promise<EidosFileSnapshot> {
  const fields = contentFieldName
    ? [
        ...(input.fields?.length
          ? input.fields
          : [{ name: "Name", type: "text" as const, isRecordLabel: true }]),
        { name: contentFieldName, type: "text" as const },
      ]
    : input.fields
  const snapshot = await source.createTable({
    ...input,
    ...(fields ? { fields } : {}),
  })
  if (!contentFieldName) return snapshot
  const table = snapshot.tables.find(
    (candidate) => candidate.table.name === input.name
  )
  const content = table?.fields.find((field) => field.name === contentFieldName)
  if (!table || !content)
    throw new Error("Created Content Field is unavailable")
  return source.updateTable(table.table.id, { contentFieldId: content.id })
}
