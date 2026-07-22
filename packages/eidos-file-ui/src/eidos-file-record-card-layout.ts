import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowPageProjection,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { decodeEidosFileJsonArray } from "@eidos.space/eidos-file"

import {
  eidosFileSelectOptions,
  type EidosFileSelectOption,
} from "./eidos-file-field-properties"
import {
  eidosFileFieldKey,
  isEidosFileRecordLabelField,
} from "./eidos-file-field-visibility"
import { orderedEidosFileFields } from "./eidos-file-view-layout"

export interface EidosFileRecordCardFieldLayout {
  field: EidosFileFieldInfo
  optionByValue?: ReadonlyMap<string, EidosFileSelectOption>
}

export interface EidosFileRecordCardLayout {
  fields: EidosFileRecordCardFieldLayout[]
  coverField: EidosFileFieldInfo | null
  fieldLimit: number
  fitContent: boolean
  hideEmptyFields: boolean
}

export function isEidosFileRecordCoverField(
  field: EidosFileFieldInfo
): boolean {
  return field.type === "file" || field.type === "url"
}

function isEmptyEidosFileRecordCardValue(
  value: EidosFileRow[string],
  field: EidosFileFieldInfo
): boolean {
  if (value === null || value === undefined || value === "") return true
  if (
    (field.storageCodec === "json_array" ||
      field.storageCodec === "relation") &&
    typeof value === "string"
  ) {
    return decodeEidosFileJsonArray(value).length === 0
  }
  return false
}

export function selectEidosFileRecordCardFields(
  layout: EidosFileRecordCardLayout,
  row: EidosFileRow
): EidosFileRecordCardFieldLayout[] {
  if (layout.fieldLimit <= 0) return []
  if (!layout.hideEmptyFields) {
    return layout.fields.slice(0, layout.fieldLimit)
  }

  const visibleFields: EidosFileRecordCardFieldLayout[] = []
  for (const fieldLayout of layout.fields) {
    if (
      isEmptyEidosFileRecordCardValue(
        row[fieldLayout.field.tableColumnName],
        fieldLayout.field
      )
    ) {
      continue
    }
    visibleFields.push(fieldLayout)
    if (visibleFields.length === layout.fieldLimit) break
  }
  return visibleFields
}

export function createEidosFileRecordCardLayout(
  fields: EidosFileFieldInfo[],
  view: EidosFileViewInfo,
  compact = false
): EidosFileRecordCardLayout {
  const coverFieldName =
    typeof view.properties?.coverField === "string"
      ? view.properties.coverField
      : typeof view.properties?.coverPreview === "string"
        ? view.properties.coverPreview
        : null
  return {
    fields: orderedEidosFileFields(fields, view)
      .filter(
        (field) =>
          !isEidosFileRecordLabelField(field) && field.valueKind !== "system"
      )
      .map((field) => {
        const options =
          field.type === "select" || field.type === "multi-select"
            ? eidosFileSelectOptions(field)
            : []
        return {
          field,
          optionByValue:
            options.length > 0
              ? new Map(options.map((option) => [option.value, option]))
              : undefined,
        }
      }),
    coverField:
      fields.find(
        (field) =>
          eidosFileFieldKey(field) === coverFieldName &&
          isEidosFileRecordCoverField(field)
      ) ?? null,
    fieldLimit: compact ? 4 : 6,
    fitContent: view.properties?.fitContent !== false,
    hideEmptyFields: view.properties?.hideEmptyFields !== false,
  }
}

export function eidosFileRecordCardPageProjection(
  fields: EidosFileFieldInfo[],
  view: EidosFileViewInfo
): EidosFileRowPageProjection {
  const layout = createEidosFileRecordCardLayout(
    fields,
    view,
    view.type === "kanban"
  )
  const preservedColumns = new Set<string>()
  if (layout.coverField) {
    preservedColumns.add(layout.coverField.tableColumnName)
  }
  if (view.type === "kanban") {
    const groupFieldKey =
      typeof view.properties?.groupField === "string"
        ? view.properties.groupField
        : view.properties?.groupByField
    const groupField = fields.find(
      (field) =>
        eidosFileFieldKey(field) === groupFieldKey && field.type === "select"
    )
    if (groupField) preservedColumns.add(groupField.tableColumnName)
  }
  const candidateFields = layout.hideEmptyFields
    ? layout.fields
    : layout.fields.slice(0, layout.fieldLimit)
  return {
    columns: candidateFields
      .map(({ field }) => field.tableColumnName)
      .filter((columnName) => !preservedColumns.has(columnName)),
    ...(preservedColumns.size > 0
      ? { preservedColumns: [...preservedColumns] }
      : {}),
    fieldLimit: layout.fieldLimit,
    omitEmptyFields: layout.hideEmptyFields,
  }
}
