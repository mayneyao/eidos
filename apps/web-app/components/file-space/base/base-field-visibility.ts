import type { BaseFieldInfo, BaseViewInfo } from "@eidos.space/base"

export function isOptionalBaseSystemField(field: BaseFieldInfo): boolean {
  return field.valueKind === "system" && field.type !== "title"
}

export function baseFieldDisplayName(field: BaseFieldInfo): string {
  return field.type === "row-id" ? "Record ID" : field.name
}

export function baseViewVisibleSystemFields(
  view: BaseViewInfo | undefined
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

export function visibleBaseFields(
  fields: BaseFieldInfo[],
  hiddenFields: readonly string[] = [],
  visibleSystemFields: readonly string[] = []
): BaseFieldInfo[] {
  const hidden = new Set(hiddenFields)
  const visibleSystem = new Set(visibleSystemFields)
  return fields.filter((field) => {
    if (isOptionalBaseSystemField(field)) {
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
