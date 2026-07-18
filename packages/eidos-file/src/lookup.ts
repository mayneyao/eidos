import type {
  EidosFileFieldInfo,
  EidosFileFieldType,
  EidosFileFormulaDisplayType,
  EidosFileLookupAggregate,
  EidosFileStorageCodec,
} from "./types"

export type EidosFileLookupTarget = Pick<EidosFileFieldInfo, "type"> &
  Partial<Pick<EidosFileFieldInfo, "property">>

const NUMERIC_LOOKUP_AGGREGATES = new Set<EidosFileLookupAggregate>([
  "sum",
  "average",
  "min",
  "max",
])

export function eidosFileLookupStorageCodec(
  aggregate: EidosFileLookupAggregate
): EidosFileStorageCodec {
  return aggregate === "values" ? "json_array" : "scalar"
}

export function eidosFileLookupAggregateSupportsTarget(
  aggregate: EidosFileLookupAggregate,
  target: EidosFileLookupTarget
): boolean {
  return (
    !NUMERIC_LOOKUP_AGGREGATES.has(aggregate) ||
    eidosFileLookupTargetDisplayType(target) === "number"
  )
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
      configuredDisplayType === "checkbox" ||
      configuredDisplayType === "date" ||
      configuredDisplayType === "datetime" ||
      configuredDisplayType === "url")
  ) {
    return configuredDisplayType
  }
  if (type === "number" || type === "rating") return "number"
  if (type === "checkbox") return "checkbox"
  if (type === "date") return "date"
  if (type === "datetime") return "datetime"
  if (type === "url") return "url"
  return "text"
}

export function eidosFileLookupDisplayType(
  aggregate: EidosFileLookupAggregate,
  target: EidosFileFieldType | EidosFileLookupTarget
): EidosFileFormulaDisplayType {
  if (aggregate === "count" || NUMERIC_LOOKUP_AGGREGATES.has(aggregate)) {
    return "number"
  }
  return eidosFileLookupTargetDisplayType(target)
}

export function eidosFileFieldStoresJsonArray(
  field: Pick<EidosFileFieldInfo, "storageCodec">
): boolean {
  return (
    field.storageCodec === "json_array" || field.storageCodec === "relation"
  )
}
