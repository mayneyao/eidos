import type {
  EidosFileFieldInfo,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"

/** Stable Field identity for persisted view/query state. */
export function eidosFileFieldKey(field: EidosFileFieldInfo): string {
  return field.id
}

/** Canonical Record Label role with read-only support for pre-1.0 UI fixtures. */
export function isEidosFileRecordLabelField(
  field: EidosFileFieldInfo
): boolean {
  return field.isRecordLabel === true
}

export function isOptionalEidosFileSystemField(
  field: EidosFileFieldInfo
): boolean {
  return field.valueKind === "system" && !isEidosFileRecordLabelField(field)
}

export function eidosFileFieldDisplayName(field: EidosFileFieldInfo): string {
  return field.type === "row-id" ? "Record ID" : field.name
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
