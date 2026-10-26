import type { SpaceTreeEntry } from "./contracts"
import {
  normalizeEidosFileFilter,
  type EidosFileFilterRule,
} from "@eidos.space/eidos-file"

export const EXPLORER_TEXT_OPERATORS = [
  "contains",
  "not-contains",
  "equals",
  "starts-with",
  "ends-with",
] as const
export type ExplorerFilterRule = {
  type: "rule"
  id: string
} & (
  | {
      field: "property"
      operator: "matches"
      value: EidosFileFilterRule
    }
  | {
      field: "name" | "path"
      operator: (typeof EXPLORER_TEXT_OPERATORS)[number]
      value: string
    }
  | {
      field: "suffix"
      operator: "in" | "not-in"
      value: readonly string[]
    }
)
export interface ExplorerFilterGroup {
  type: "group"
  id: string
  conjunction: "and" | "or"
  children: readonly (ExplorerFilterRule | ExplorerFilterGroup)[]
}
/** Legacy suffix lists are accepted at the boundary and converted by the editor. */
export type ExplorerFileFilter = readonly string[] | ExplorerFilterGroup
export const ALL_EXPLORER_FILES: ExplorerFileFilter = []
export const MAX_EXPLORER_FILTER_DEPTH = 3
export const MAX_EXPLORER_FILTER_NODES = 64

function normalizeSuffixes(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 32)
    throw new Error("Invalid file suffixes")
  const normalized = value.map((suffix: unknown) => {
    if (
      typeof suffix !== "string" ||
      !suffix ||
      suffix.length > 128 ||
      /[\s,/\\*?\u0000-\u001f\u007f]/u.test(suffix.replace(/^\*\./u, "."))
    )
      throw new Error("Invalid file suffix")
    const bare = suffix.replace(/^\*\./u, ".").toLowerCase()
    if (bare === ".") throw new Error("Incomplete file suffix")
    return bare.startsWith(".") ? bare : `.${bare}`
  })
  return [...new Set(normalized)].sort()
}

export function parseExplorerFileFilter(value: string): string[] {
  return normalizeSuffixes(
    value
      .trim()
      .split(/[,，;；\s]+/u)
      .filter(Boolean)
  )
}

export function isExplorerFilterGroup(
  filter: ExplorerFileFilter
): filter is ExplorerFilterGroup {
  return !Array.isArray(filter)
}

export function toExplorerFilterGroup(
  filter: ExplorerFileFilter
): ExplorerFilterGroup {
  return isExplorerFilterGroup(filter)
    ? filter
    : {
        type: "group",
        id: "legacy",
        conjunction: "and",
        children: filter.length
          ? [
              {
                type: "rule",
                id: "legacy-suffix",
                field: "suffix",
                operator: "in",
                value: filter,
              },
            ]
          : [],
      }
}

export function normalizeExplorerFileFilter(
  value: unknown
): ExplorerFileFilter {
  if (Array.isArray(value)) return normalizeSuffixes(value)
  let nodes = 0
  const visit = (
    node: unknown,
    depth: number
  ): ExplorerFilterGroup | ExplorerFilterRule => {
    if (
      ++nodes > MAX_EXPLORER_FILTER_NODES ||
      depth > MAX_EXPLORER_FILTER_DEPTH + 1 ||
      !node ||
      typeof node !== "object"
    )
      throw new Error("Invalid file filter")
    const item = node as Record<string, unknown>
    if (typeof item.id !== "string" || !item.id || item.id.length > 128)
      throw new Error("Invalid filter identifier")
    if (item.type === "group") {
      if (
        depth > MAX_EXPLORER_FILTER_DEPTH ||
        (item.conjunction !== "and" && item.conjunction !== "or") ||
        !Array.isArray(item.children) ||
        item.children.length > MAX_EXPLORER_FILTER_NODES
      )
        throw new Error("Invalid filter group")
      return {
        type: "group",
        id: item.id,
        conjunction: item.conjunction,
        children: item.children.map((child) => visit(child, depth + 1)),
      }
    }
    if (item.type !== "rule") throw new Error("Invalid filter condition")
    if (item.field === "property" && item.operator === "matches") {
      const group = normalizeEidosFileFilter({
        type: "group",
        conjunction: "and",
        children: [item.value],
      })
      const rule = group?.children[0]
      if (!rule || rule.type !== "rule")
        throw new Error("Invalid property condition")
      if (
        !rule.field ||
        rule.field.length > 128 ||
        (typeof rule.value === "string" && rule.value.length > 4096) ||
        (Array.isArray(rule.value) &&
          (rule.value.length > 128 ||
            rule.value.some(
              (value) => typeof value === "string" && value.length > 4096
            )))
      )
        throw new Error("Invalid property condition")
      return {
        type: "rule",
        id: item.id,
        field: "property",
        operator: "matches",
        value: rule,
      }
    }
    if (
      item.field === "suffix" &&
      (item.operator === "in" || item.operator === "not-in")
    )
      return {
        type: "rule",
        id: item.id,
        field: "suffix",
        operator: item.operator,
        value: normalizeSuffixes(item.value),
      }
    if (
      (item.field !== "name" && item.field !== "path") ||
      !EXPLORER_TEXT_OPERATORS.includes(
        item.operator as (typeof EXPLORER_TEXT_OPERATORS)[number]
      ) ||
      typeof item.value !== "string" ||
      item.value.length > 4096 ||
      /[\u0000-\u001f\u007f]/u.test(item.value)
    )
      throw new Error("Invalid text condition")
    return {
      type: "rule",
      id: item.id,
      field: item.field,
      operator: item.operator as (typeof EXPLORER_TEXT_OPERATORS)[number],
      value: item.value,
    }
  }
  const normalized = visit(value, 0)
  if (normalized.type !== "group") throw new Error("Expected a filter group")
  return normalized
}

export function countExplorerFilterRules(filter: ExplorerFileFilter): number {
  if (!isExplorerFilterGroup(filter)) return filter.length ? 1 : 0
  return filter.children.reduce(
    (count, child) =>
      count +
      (child.type === "group"
        ? countExplorerFilterRules(child)
        : isExplorerRuleActive(child)
          ? 1
          : 0),
    0
  )
}

export function isExplorerRuleActive(rule: ExplorerFilterRule): boolean {
  if (rule.field !== "property") return rule.value.length > 0
  return (
    rule.value.operator === "is-empty" ||
    rule.value.operator === "is-not-empty" ||
    (rule.value.value !== undefined &&
      rule.value.value !== "" &&
      (!Array.isArray(rule.value.value) || rule.value.value.length > 0))
  )
}

export function hasExplorerPropertyFilter(filter: ExplorerFileFilter): boolean {
  const visit = (group: ExplorerFilterGroup): boolean =>
    group.children.some((child) =>
      child.type === "group"
        ? visit(child)
        : child.field === "property" && isExplorerRuleActive(child)
    )
  return visit(toExplorerFilterGroup(filter))
}

export function countExplorerFilterNodes(group: ExplorerFilterGroup): number {
  return (
    1 +
    group.children.reduce(
      (count, child) =>
        count + (child.type === "group" ? countExplorerFilterNodes(child) : 1),
      0
    )
  )
}

/** Editor identities and incomplete drafts do not change matching semantics. */
export function explorerFilterSignature(filter: ExplorerFileFilter): string {
  const active = (node: ExplorerFilterGroup | ExplorerFilterRule): unknown => {
    if (node.type === "rule")
      return isExplorerRuleActive(node)
        ? {
            field: node.field,
            operator: node.operator,
            value:
              node.field === "property"
                ? node.value
                : typeof node.value === "string"
                  ? node.value.toLowerCase()
                  : node.value.map((value) => value.toLowerCase()),
          }
        : null
    const children = node.children.map(active).filter((child) => child !== null)
    return children.length === 1
      ? children[0]
      : children.length
        ? { conjunction: node.conjunction, children }
        : null
  }
  return JSON.stringify(active(toExplorerFilterGroup(filter)))
}

export function matchesExplorerFileFilter(
  name: string,
  filter: ExplorerFileFilter,
  relativePath = name,
  propertyMatches?: ReadonlyMap<string, ReadonlySet<string>>
): boolean {
  const leaf = name.slice(name.lastIndexOf("/") + 1).toLowerCase()
  if (!isExplorerFilterGroup(filter))
    return !filter.length || filter.some((suffix) => leaf.endsWith(suffix))
  const evaluate = (
    node: ExplorerFilterGroup | ExplorerFilterRule
  ): boolean | null => {
    if (node.type === "group") {
      const values = node.children
        .map(evaluate)
        .filter((result): result is boolean => result !== null)
      return values.length
        ? node.conjunction === "and"
          ? values.every(Boolean)
          : values.some(Boolean)
        : null
    }
    if (!isExplorerRuleActive(node)) return null
    if (node.field === "property")
      return propertyMatches?.get(node.id)?.has(relativePath) ?? false
    if (node.field === "suffix") {
      const match = node.value.some((suffix) =>
        leaf.endsWith(suffix.toLowerCase())
      )
      return node.operator === "in" ? match : !match
    }
    const text = node.field === "name" ? leaf : relativePath.toLowerCase()
    const value = node.value.toLowerCase()
    switch (node.operator) {
      case "contains":
        return text.includes(value)
      case "not-contains":
        return !text.includes(value)
      case "equals":
        return text === value
      case "starts-with":
        return text.startsWith(value)
      case "ends-with":
        return text.endsWith(value)
    }
  }
  return evaluate(filter) ?? true
}

/** A directory belongs in the result only when a descendant file matches. */
export function filterExplorerEntries(
  entries: SpaceTreeEntry[],
  filter: ExplorerFileFilter,
  propertyMatches?: ReadonlyMap<string, ReadonlySet<string>>
): SpaceTreeEntry[] {
  if (!countExplorerFilterRules(filter)) return entries
  return entries.flatMap((entry) => {
    if (entry.kind !== "directory")
      return matchesExplorerFileFilter(
        entry.name,
        filter,
        entry.relativePath,
        propertyMatches
      )
        ? [entry]
        : []
    const children = filterExplorerEntries(
      entry.children ?? [],
      filter,
      propertyMatches
    )
    return children.length
      ? [{ ...entry, children, childrenLoaded: entry.childrenLoaded !== false }]
      : []
  })
}
