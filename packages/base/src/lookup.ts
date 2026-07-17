import type {
  BaseFieldInfo,
  BaseFieldType,
  BaseFormulaDisplayType,
  BaseLookupAggregate,
  BaseStorageCodec,
} from "./types"

type BaseLookupTarget = Pick<BaseFieldInfo, "type"> &
  Partial<Pick<BaseFieldInfo, "property">>

const NUMERIC_LOOKUP_AGGREGATES = new Set<BaseLookupAggregate>([
  "sum",
  "average",
  "min",
  "max",
])

export function baseLookupStorageCodec(
  aggregate: BaseLookupAggregate
): BaseStorageCodec {
  return aggregate === "values" ? "json_array" : "scalar"
}

export function baseLookupAggregateSupportsTarget(
  aggregate: BaseLookupAggregate,
  target: BaseLookupTarget
): boolean {
  return (
    !NUMERIC_LOOKUP_AGGREGATES.has(aggregate) ||
    baseLookupTargetDisplayType(target) === "number"
  )
}

export function baseLookupTargetDisplayType(
  target: BaseFieldType | BaseLookupTarget
): BaseFormulaDisplayType {
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

export function baseLookupDisplayType(
  aggregate: BaseLookupAggregate,
  target: BaseFieldType | BaseLookupTarget
): BaseFormulaDisplayType {
  if (aggregate === "count" || NUMERIC_LOOKUP_AGGREGATES.has(aggregate)) {
    return "number"
  }
  return baseLookupTargetDisplayType(target)
}

export function baseFieldStoresJsonArray(
  field: Pick<BaseFieldInfo, "storageCodec">
): boolean {
  return (
    field.storageCodec === "json_array" || field.storageCodec === "relation"
  )
}
