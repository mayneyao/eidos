import {
  eidosFileFieldQueryCapabilities,
  type EidosFileFieldInfo,
  type EidosFileFilterGroup,
  type EidosFileFilterOperator,
} from "@eidos.space/eidos-file"
import {
  EXPLORER_TEXT_OPERATORS,
  toExplorerFilterGroup,
  type ExplorerFileFilter,
  type ExplorerFilterGroup,
  type ExplorerFilterRule,
} from "./explorer-file-filter"

export const EXPLORER_FIELD_PREFIX = "explorer:"

export function explorerBuiltinFields(
  t: (text: string) => string
): EidosFileFieldInfo[] {
  return [
    ["name", "File name"],
    ["suffix", "File suffix"],
    ["path", "File path"],
  ].map(([key, label]) => ({
    id: EXPLORER_FIELD_PREFIX + key,
    name: t(label),
    type: key === "suffix" ? "multi-select" : "text",
    tableId: "explorer",
    tableName: "explorer",
    tableColumnName: key,
    physicalName: key,
    property: null,
    storageCodec: key === "suffix" ? "json_array" : "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }))
}

export function explorerFieldOperators(
  field: EidosFileFieldInfo
): EidosFileFilterOperator[] {
  if (field.id === EXPLORER_FIELD_PREFIX + "suffix")
    return ["is-any-of", "is-none-of"]
  if (field.id.startsWith(EXPLORER_FIELD_PREFIX))
    return [...EXPLORER_TEXT_OPERATORS]
  return [...eidosFileFieldQueryCapabilities(field).filterOperators]
}

export function explorerToUIFilter(
  filter: ExplorerFileFilter
): EidosFileFilterGroup {
  const visit = (group: ExplorerFilterGroup): EidosFileFilterGroup => ({
    type: "group",
    conjunction: group.conjunction,
    children: group.children.map((child) =>
      child.type === "group"
        ? visit(child)
        : child.field === "property"
          ? child.value
          : {
              type: "rule",
              field: EXPLORER_FIELD_PREFIX + child.field,
              operator:
                child.operator === "in"
                  ? "is-any-of"
                  : child.operator === "not-in"
                    ? "is-none-of"
                    : child.operator,
              value:
                typeof child.value === "string"
                  ? child.value
                  : [...child.value],
            }
    ),
  })
  return visit(toExplorerFilterGroup(filter))
}

export function explorerFromUIFilter(
  group: EidosFileFilterGroup,
  prefix = "filter"
): ExplorerFilterGroup {
  return {
    type: "group",
    id: prefix,
    conjunction: group.conjunction,
    children: group.children.map(
      (child, index): ExplorerFilterGroup | ExplorerFilterRule => {
        const id = prefix + "-" + index
        if (child.type === "group") return explorerFromUIFilter(child, id)
        if (child.field === EXPLORER_FIELD_PREFIX + "suffix")
          return {
            type: "rule",
            id,
            field: "suffix",
            operator: child.operator === "is-none-of" ? "not-in" : "in",
            value: Array.isArray(child.value)
              ? child.value.filter(
                  (value): value is string => typeof value === "string"
                )
              : [],
          }
        if (
          child.field === EXPLORER_FIELD_PREFIX + "name" ||
          child.field === EXPLORER_FIELD_PREFIX + "path"
        )
          return {
            type: "rule",
            id,
            field:
              child.field === EXPLORER_FIELD_PREFIX + "name" ? "name" : "path",
            operator: EXPLORER_TEXT_OPERATORS.includes(
              child.operator as (typeof EXPLORER_TEXT_OPERATORS)[number]
            )
              ? (child.operator as (typeof EXPLORER_TEXT_OPERATORS)[number])
              : "contains",
            value: typeof child.value === "string" ? child.value : "",
          }
        return {
          type: "rule",
          id,
          field: "property",
          operator: "matches",
          value: child,
        }
      }
    ),
  }
}
