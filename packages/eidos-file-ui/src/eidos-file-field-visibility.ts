import type {
  EidosFileFieldInfo,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"

/** Stable Field identity for persisted view/query state. */
export function eidosFileFieldKey(field: EidosFileFieldInfo): string {
  return field.id
}

/** Canonical Record Label role. */
export function isEidosFileRecordLabelField(
  field: EidosFileFieldInfo
): boolean {
  return field.isRecordLabel === true
}

/**
 * Use the Runtime capability whenever it is available. The fallback keeps
 * older custom editor data sources safe while they migrate to `writable`.
 */
export function isEidosFileFieldWritable(field: EidosFileFieldInfo): boolean {
  if (typeof field.writable === "boolean") return field.writable
  if (field.systemRole != null || field.isDerived) return false
  if (field.valueKind === "source") return true
  return (
    field.valueKind === "relation" && field.property?.direction !== "inverse"
  )
}

const EIDOS_FILE_RECORD_LABEL_SCALAR_TYPES = new Set([
  "row-id",
  "created-time",
  "last-edited-time",
  "text",
  "number",
  "integer",
  "checkbox",
  "date",
  "datetime",
  "url",
  "rating",
  "select",
])

/** Exact core Record Label eligibility used by every settings surface. */
export function isEidosFileRecordLabelEligible(
  field: EidosFileFieldInfo
): boolean {
  if (field.type === "lookup") return false
  if (field.type === "formula") {
    return EIDOS_FILE_RECORD_LABEL_SCALAR_TYPES.has(
      String(field.property?.displayType)
    )
  }
  return EIDOS_FILE_RECORD_LABEL_SCALAR_TYPES.has(field.type)
}

export function eidosFileContentField(
  table: EidosFileTableSnapshot
): EidosFileFieldInfo | null {
  const fieldId = table.table.contentFieldId
  if (!fieldId) return null
  return (
    table.fields.find(
      (field) =>
        field.id === fieldId &&
        field.type === "text" &&
        field.valueKind === "source" &&
        field.systemRole == null
    ) ?? null
  )
}

export function isOptionalEidosFileSystemField(
  field: EidosFileFieldInfo
): boolean {
  return field.valueKind === "system" && !isEidosFileRecordLabelField(field)
}

export function eidosFileFieldDisplayName(field: EidosFileFieldInfo): string {
  switch (field.systemRole ?? field.type) {
    case "row-id":
      return "Record ID"
    case "created-time":
      return "Created at"
    case "updated-time":
    case "last-edited-time":
      return "Updated at"
    default:
      return field.name
  }
}

export function eidosFileViewVisibleSystemFields(
  view: EidosFileViewInfo | undefined
): string[] {
  const value = view?.properties?.visibleSystemFields
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value.filter(
        (columnName): columnName is string =>
          typeof columnName === "string" && columnName.length > 0
      )
    )
  )
}

export function visibleEidosFileFields(
  fields: EidosFileFieldInfo[],
  hiddenFields: readonly string[] = [],
  visibleSystemFields: readonly string[] = []
): EidosFileFieldInfo[] {
  const hidden = new Set(hiddenFields)
  const visibleSystem = new Set(visibleSystemFields)
  return fields.filter((field) => {
    if (isOptionalEidosFileSystemField(field)) {
      return visibleSystem.has(eidosFileFieldKey(field))
    }
    return (
      !field.isHidden &&
      !hidden.has(eidosFileFieldKey(field)) &&
      (isEidosFileRecordLabelField(field) ||
        field.valueKind === "source" ||
        field.valueKind === "relation" ||
        field.valueKind === "derived")
    )
  })
}
