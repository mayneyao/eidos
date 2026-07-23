import type {
  EidosFileFieldInfo,
  EidosFileRelationValue,
} from "@eidos.space/eidos-file"

import type { EidosFileEditorDataSource } from "./data-source"
import { isEidosFileRecordLabelField } from "./eidos-file-field-visibility"

export async function searchEidosFileRelationRecords(
  source: EidosFileEditorDataSource,
  field: EidosFileFieldInfo,
  query: string
): Promise<EidosFileRelationValue[]> {
  const targetTableId = field.property?.targetTableId
  if (typeof targetTableId !== "string" || !targetTableId) return []
  const snapshot = await source.getSnapshot()
  const targetTable = snapshot.tables.find(
    (candidate) => candidate.table.id === targetTableId
  )
  const labelField = targetTable?.fields.find(isEidosFileRecordLabelField)
  if (!labelField) return []
  const page = await source.getPage(
    targetTableId,
    0,
    50,
    query.trim() ? { search: query.trim() } : {},
    undefined,
    undefined,
    {
      columns: [labelField.tableColumnName],
      preservedColumns: ["_id"],
      fieldLimit: 1,
    }
  )
  return page.rows.flatMap((row) => {
    const id = row._id
    if (id === null || id === undefined) return []
    const display = row[labelField.tableColumnName] ?? id
    return [{ id: String(id), title: String(display ?? id) }]
  })
}
