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

export async function resolveEidosFileRelationRecords(
  source: EidosFileEditorDataSource,
  field: EidosFileFieldInfo,
  rowIds: string[]
): Promise<EidosFileRelationValue[]> {
  const uniqueRowIds = [...new Set(rowIds.filter(Boolean))]
  if (uniqueRowIds.length === 0) return []
  const targetTableId = field.property?.targetTableId
  if (typeof targetTableId !== "string" || !targetTableId || !source.getRow) {
    return uniqueRowIds.map((id) => ({ id, title: id }))
  }
  const snapshot = await source.getSnapshot()
  const targetTable = snapshot.tables.find(
    (candidate) => candidate.table.id === targetTableId
  )
  const labelField = targetTable?.fields.find(isEidosFileRecordLabelField)
  if (!labelField) {
    return uniqueRowIds.map((id) => ({ id, title: id }))
  }
  const rows = await Promise.all(
    uniqueRowIds.map((id) => source.getRow!(targetTableId, id))
  )
  return uniqueRowIds.map((id, index) => {
    const display = rows[index]?.[labelField.tableColumnName] ?? id
    return { id, title: String(display ?? id) }
  })
}
