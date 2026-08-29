import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowPageProjection,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { decodeEidosFileJsonArray } from "@eidos.space/eidos-file"

import {
  eidosFileSelectOptions,
  eidosFileUrlDisplaysImage,
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
  return field.type === "file" || eidosFileUrlDisplaysImage(field)
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
  const coverFieldName = view.properties?.coverField
  const availableFields = orderedEidosFileFields(fields, view).filter(
    (field) =>
      !isEidosFileRecordLabelField(field) && field.valueKind !== "system"
  )
  const configuredCardFields = view.properties?.cardFields
  const defaultCardFields =
    view.type === "kanban" && typeof view.properties?.groupField === "string"
      ? availableFields.filter(
          (field) => eidosFileFieldKey(field) !== view.properties?.groupField
        )
      : availableFields
  const cardFields = Array.isArray(configuredCardFields)
    ? configuredCardFields.flatMap((fieldId) => {
        if (typeof fieldId !== "string") return []
        const field = availableFields.find(
          (candidate) => eidosFileFieldKey(candidate) === fieldId
        )
        return field ? [field] : []
      })
    : defaultCardFields
  const coverFit = view.properties?.coverFit
  return {
    fields: cardFields.map((field) => {
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
    fieldLimit: Array.isArray(configuredCardFields)
      ? cardFields.length
      : compact
        ? 4
        : 6,
    fitContent:
      coverFit === "contain" ||
      (coverFit !== "cover" && view.properties?.fitContent === true),
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
    const groupFieldKey = view.properties?.groupField
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
