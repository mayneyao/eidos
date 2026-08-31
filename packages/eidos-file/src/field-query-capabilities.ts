import type { AtomicType, TypeRef } from "./runtime-contract"
import type { EidosFileFieldInfo, EidosFileFilterOperator } from "./types"

export type EidosFileSortPosition = "any" | "last" | null

export interface EidosFileFieldQueryCapabilities {
  /** Filter operations the shared editor can construct without raw typed data. */
  filterOperators: readonly EidosFileFilterOperator[]
  /** Whether the Runtime can compare values with ordered operators. */
  ordered: boolean
  /** Whether list membership operators are valid for the logical type. */
  membership: boolean
  /** Whether the Runtime can evaluate string-fragment operators. */
  stringMatch: boolean
  /** Whether this type participates in the current Runtime search profile. */
  searchable: boolean
  /** Whether this type can be sorted. */
  sortable: boolean
  /** Row ID is only valid as the terminal explicit sort. */
  sortPosition: EidosFileSortPosition
  /** Whether this type can be used as a Runtime group key. */
  groupable: boolean
}

const EMPTY_OPERATORS = [
  "is-empty",
  "is-not-empty",
] as const satisfies readonly EidosFileFilterOperator[]

const EQUALITY_OPERATORS = [
  "equals",
  "not-equals",
] as const satisfies readonly EidosFileFilterOperator[]

const STRING_OPERATORS = [
  ...EQUALITY_OPERATORS,
  "contains",
  "not-contains",
  "starts-with",
  "ends-with",
  ...EMPTY_OPERATORS,
] as const satisfies readonly EidosFileFilterOperator[]

const ORDERED_OPERATORS = [
  ...EQUALITY_OPERATORS,
  "greater-than",
  "greater-than-or-equal",
  "less-than",
  "less-than-or-equal",
  ...EMPTY_OPERATORS,
] as const satisfies readonly EidosFileFilterOperator[]

const TEMPORAL_OPERATORS = [
  ...ORDERED_OPERATORS,
  "is-between",
  "is-relative-to-today",
] as const satisfies readonly EidosFileFilterOperator[]

const LIST_OPERATORS = [
  "contains",
  "not-contains",
  "is-any-of",
  "is-all-of",
  "is-none-of",
  ...EMPTY_OPERATORS,
] as const satisfies readonly EidosFileFilterOperator[]

const CHECKBOX_OPERATORS = [
  ...EQUALITY_OPERATORS,
  ...EMPTY_OPERATORS,
] as const satisfies readonly EidosFileFilterOperator[]

const JSON_OPERATORS = [
  ...EQUALITY_OPERATORS,
  ...EMPTY_OPERATORS,
] as const satisfies readonly EidosFileFilterOperator[]

const FILE_OPERATORS = [
  ...EMPTY_OPERATORS,
] as const satisfies readonly EidosFileFilterOperator[]

const TYPE_REF_ATOMS = new Set<string>([
  "text",
  "number",
  "integer",
  "checkbox",
  "date",
  "datetime",
  "url",
  "json",
  "select",
  "multi-select",
  "file",
  "relation",
  "row-id",
  "file-entry",
])

const LIST_ATOMS = new Set<string>([
  "text",
  "number",
  "integer",
  "checkbox",
  "date",
  "datetime",
  "url",
  "select",
  "row-id",
  "file-entry",
])

function configuredTypeRef(value: unknown): TypeRef | null {
  if (typeof value === "string" && TYPE_REF_ATOMS.has(value)) {
    return value as TypeRef
  }
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { kind?: unknown }).kind === "list" &&
    typeof (value as { element?: unknown }).element === "string" &&
    LIST_ATOMS.has((value as { element: string }).element)
  ) {
    return {
      kind: "list",
      element: (value as { element: AtomicType }).element,
    }
  }
  return null
}

/** Resolve the public logical TypeRef represented by an editor/runtime Field. */
export function eidosFileFieldValueType(
  field: Pick<
    EidosFileFieldInfo,
    "type" | "systemRole" | "property" | "storageCodec"
  >
): TypeRef {
  if (field.systemRole === "row-id" || field.type === "row-id") {
    return "row-id"
  }
  if (
    field.systemRole === "created-time" ||
    field.systemRole === "updated-time" ||
    field.type === "created-time" ||
    field.type === "last-edited-time"
  ) {
    return "datetime"
  }
  if (field.type === "rating") return "integer"
  if (field.type === "formula" || field.type === "lookup") {
    const generated = configuredTypeRef(field.property?.valueType)
    if (generated) return generated
    const display = configuredTypeRef(field.property?.displayType) ?? "text"
    if (field.type === "lookup" && field.property?.aggregate === "values") {
      const element =
        display === "file" || display === "json"
          ? "file-entry"
          : display === "relation"
            ? "row-id"
            : display === "multi-select"
              ? "select"
              : typeof display === "object"
                ? display.element
                : display
      return { kind: "list", element: element as AtomicType }
    }
    if (field.type === "lookup" && display === "json") return "file-entry"
    return display
  }
  if (field.type === "relation") return "relation"
  if (field.type === "multi-select") return "multi-select"
  if (field.type === "file") return "file"
  return configuredTypeRef(field.type) ?? "text"
}

/**
 * Canonical query capability policy for Runtime validation and UI affordances.
 * It intentionally describes implemented behavior, not SQLite storage classes.
 */
export function eidosFileTypeRefQueryCapabilities(
  type: TypeRef,
  context: {
    isRecordLabel?: boolean
    contextualRowId?: boolean
  } = {}
): EidosFileFieldQueryCapabilities {
  const listElement =
    typeof type === "object"
      ? type.element
      : type === "multi-select"
        ? "select"
        : type === "relation"
          ? "row-id"
          : type === "file"
            ? "file-entry"
            : null
  const list = listElement !== null
  const fileValue = type === "file-entry" || listElement === "file-entry"
  const ordered =
    typeof type === "string" &&
    [
      "text",
      "number",
      "integer",
      "checkbox",
      "date",
      "datetime",
      "url",
      "select",
      "row-id",
    ].includes(type)
  const stringMatch =
    typeof type === "string" &&
    ["text", "url", "select", "row-id"].includes(type)
  const searchableList =
    listElement !== null &&
    ["text", "url", "select", "file-entry"].includes(listElement)
  const recordLabelSearchable =
    context.isRecordLabel === true &&
    typeof type === "string" &&
    [
      "text",
      "url",
      "select",
      "number",
      "integer",
      "checkbox",
      "date",
      "datetime",
      "row-id",
    ].includes(type)
  const contextualRowId =
    context.contextualRowId === true &&
    typeof type === "object" &&
    type.element === "row-id"
  const searchable =
    stringMatch ||
    searchableList ||
    type === "file-entry" ||
    type === "relation" ||
    recordLabelSearchable ||
    contextualRowId
  const sortPosition: EidosFileSortPosition = !ordered
    ? null
    : type === "row-id"
      ? "last"
      : "any"

  let filterOperators: readonly EidosFileFilterOperator[]
  if (fileValue) filterOperators = FILE_OPERATORS
  else if (list) filterOperators = LIST_OPERATORS
  else if (type === "checkbox") filterOperators = CHECKBOX_OPERATORS
  else if (type === "date" || type === "datetime") {
    filterOperators = TEMPORAL_OPERATORS
  } else if (type === "number" || type === "integer") {
    filterOperators = ORDERED_OPERATORS
  } else if (stringMatch) filterOperators = STRING_OPERATORS
  else if (type === "json") filterOperators = JSON_OPERATORS
  else filterOperators = EMPTY_OPERATORS

  return {
    filterOperators,
    ordered,
    membership: list,
    stringMatch,
    searchable,
    sortable: sortPosition !== null,
    sortPosition,
    groupable: ordered,
  }
}

export function eidosFileFieldQueryCapabilities(
  field: Pick<
    EidosFileFieldInfo,
    "type" | "systemRole" | "property" | "storageCodec" | "isRecordLabel"
  >
): EidosFileFieldQueryCapabilities {
  const type = eidosFileFieldValueType(field)
  const contextualRowIdLookup =
    field.type === "lookup" &&
    typeof type === "object" &&
    type.element === "row-id" &&
    typeof field.property?.relationField === "string"
  return eidosFileTypeRefQueryCapabilities(type, {
    isRecordLabel: field.isRecordLabel,
    contextualRowId: contextualRowIdLookup,
  })
}
