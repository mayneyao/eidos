import type {
  EidosFileFieldInfo,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"

export function isOptionalEidosFileSystemField(
  field: EidosFileFieldInfo
): boolean {
  return field.valueKind === "system" && field.type !== "title"
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
      return visibleSystem.has(field.tableColumnName)
    }
    return (
      !field.isHidden &&
      !hidden.has(field.tableColumnName) &&
      (field.tableColumnName === "title" ||
        field.valueKind === "source" ||
        field.valueKind === "relation" ||
        field.valueKind === "derived")
    )
  })
}
