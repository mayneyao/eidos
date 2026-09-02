import type {
  EidosFileFieldInfo,
  EidosFileFieldType,
  EidosFileFormulaDisplayType,
  EidosFileLookupAggregate,
  EidosFileStorageCodec,
} from "./types"
import type { AtomicType, TypeRef } from "./runtime-contract"

export type EidosFileLookupTarget = Pick<EidosFileFieldInfo, "type"> &
  Partial<Pick<EidosFileFieldInfo, "property">>

const NUMERIC_LOOKUP_AGGREGATES = new Set<EidosFileLookupAggregate>([
  "sum",
  "average",
])

export function eidosFileLookupStorageCodec(
  aggregate: EidosFileLookupAggregate
): EidosFileStorageCodec {
  return aggregate === "values" ? "json_array" : "scalar"
}

export function eidosFileLookupAggregateSupportsTarget(
  aggregate: EidosFileLookupAggregate,
  target: EidosFileFieldType | EidosFileLookupTarget
): boolean {
  const element = eidosFileLookupElementType(target)
  if (NUMERIC_LOOKUP_AGGREGATES.has(aggregate))
    return element === "number" || element === "integer"
  if (aggregate === "min" || aggregate === "max")
    return LOOKUP_SORTABLE_TYPES.has(element)
  return true
}

const LOOKUP_SORTABLE_TYPES = new Set<AtomicType>([
  "text",
  "url",
  "select",
  "row-id",
  "integer",
  "number",
  "checkbox",
  "date",
  "datetime",
])

export function eidosFileLookupTargetValueType(
  target: EidosFileFieldType | EidosFileLookupTarget
): TypeRef {
  const type = typeof target === "string" ? target : target.type
  const generated =
    typeof target === "string" ? undefined : target.property?.valueType
  const generatedObject =
    generated && typeof generated === "object"
      ? (generated as Record<string, unknown>)
      : undefined
  if (typeof generated === "string") {
    if (generated === "json") return type === "lookup" ? "file-entry" : "text"
    return generated as TypeRef
  }
  if (
    generatedObject?.kind === "list" &&
    typeof generatedObject.element === "string"
  ) {
    return generated as TypeRef
  }
  if (type === "row-id") return "row-id"
  if (type === "created-time" || type === "last-edited-time") return "datetime"
  if (type === "multi-select") return "multi-select"
  if (type === "file") return "file"
  if (type === "relation") return "relation"
  if (type === "select") return "select"
  if (type === "rating") return "number"
  if (type === "formula" || type === "lookup") {
    if (
      type === "lookup" &&
      typeof target !== "string" &&
      target.property?.displayType === "json"
    ) {
      return "file-entry"
    }
    const displayType = eidosFileLookupTargetDisplayType(target)
    return displayType
  }
  return type as AtomicType
}

export function eidosFileLookupElementType(
  target: EidosFileFieldType | EidosFileLookupTarget
): AtomicType {
  const type = eidosFileLookupTargetValueType(target)
  if (typeof type === "object") return type.element
  if (type === "multi-select") return "select"
  if (type === "file") return "file-entry"
  if (type === "relation") return "row-id"
  return type as AtomicType
}

export function eidosFileLookupValueType(
  aggregate: EidosFileLookupAggregate,
  target: EidosFileFieldType | EidosFileLookupTarget
): TypeRef {
  const element = eidosFileLookupElementType(target)
  if (aggregate === "values") return { kind: "list", element }
  if (aggregate === "count") return "integer"
  if (aggregate === "average") return "number"
  if (aggregate === "sum") return element === "integer" ? "integer" : "number"
  return element
}

export function eidosFileLookupTargetDisplayType(
  target: EidosFileFieldType | EidosFileLookupTarget
): EidosFileFormulaDisplayType {
  const type = typeof target === "string" ? target : target.type
  const configuredDisplayType =
    typeof target === "string" ? undefined : target.property?.displayType
  if (
    (type === "formula" || type === "lookup") &&
    (configuredDisplayType === "text" ||
      configuredDisplayType === "number" ||
      configuredDisplayType === "integer" ||
      configuredDisplayType === "checkbox" ||
      configuredDisplayType === "date" ||
      configuredDisplayType === "datetime" ||
      configuredDisplayType === "url")
  ) {
    return configuredDisplayType
  }
  if (type === "number" || type === "rating") return "number"
  if (type === "integer") return "integer"
  if (type === "checkbox") return "checkbox"
  if (type === "date") return "date"
  if (type === "datetime") return "datetime"
  if (type === "url") return "url"
  if (type === "file") return "text"
  return "text"
}

export function eidosFileLookupDisplayType(
  aggregate: EidosFileLookupAggregate,
  target: EidosFileFieldType | EidosFileLookupTarget
): EidosFileFormulaDisplayType {
  const valueType = eidosFileLookupValueType(aggregate, target)
  const atom = typeof valueType === "object" ? valueType.element : valueType
  if (atom === "row-id" || atom === "select") return "text"
  if (atom === "file-entry") return "text"
  return atom as EidosFileFormulaDisplayType
}

export function eidosFileFieldStoresJsonArray(
  field: Pick<EidosFileFieldInfo, "storageCodec">
): boolean {
  return (
    field.storageCodec === "json_array" || field.storageCodec === "relation"
  )
}
