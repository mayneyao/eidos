import {
  hasEidosFileCalendarQuery,
  hasRetiredEidosFileDateQuery,
} from "@eidos.space/eidos-file"
import {
  normalizeExplorerCalendarExecution,
  type ExplorerCalendarExecution,
} from "../../shared/explorer-calendar"
import fs from "node:fs/promises"
import { explorerGitignoreFilter } from "./explorer-gitignore"
import type { SpaceTreeEntry } from "../../shared/contracts"
import type {
  EidosFileDataSource,
  EidosFileTableSnapshot,
} from "@eidos.space/eidos-file"
import {
  filterExplorerEntries,
  toExplorerFilterGroup,
  isExplorerRuleActive,
  type ExplorerFilterGroup,
  type ExplorerFilterRule,
  type ExplorerFileFilter,
} from "../../shared/explorer-file-filter"
import {
  listSpaceTree,
  normalizeMutableRelativePath,
  resolveSpaceDirectory,
} from "./space-paths"
import { compileExplorerFileSystemFilter } from "./explorer-file-system-predicates"

/** Property comparisons stay in the canonical Runtime, including dates and list membership. */
export async function explorerPropertyMatches(
  filter: ExplorerFileFilter,
  table: EidosFileTableSnapshot,
  getPage: EidosFileDataSource["getPage"],
  execution?: ExplorerCalendarExecution
): Promise<Map<string, ReadonlySet<string>> & { referenceInstant?: string }> {
  const calendarExecution = normalizeExplorerCalendarExecution(execution)
  const matches: Map<string, ReadonlySet<string>> & {
    referenceInstant?: string
  } = new Map()
  const pathField = table.fields.find(
    (field) => field.name === "path" && field.settings?.isSystem === true
  )
  if (!pathField) throw new Error("File properties are unavailable")
  const predicates: Extract<ExplorerFilterRule, { field: "property" }>[] = []
  const collect = (group: ExplorerFilterGroup): void => {
    for (const child of group.children) {
      if (child.type === "group") {
        collect(child)
        continue
      }
      if (child.field !== "property") continue
      if (hasRetiredEidosFileDateQuery(child.value))
        throw new Error("Reset this date filter to use calendar periods.")
      if (!isExplorerRuleActive(child)) continue
      if (
        !table.fields.some(
          (field) =>
            field.id === child.value.field &&
            field.settings?.isSystem !== true &&
            !field.isHidden
        )
      )
        throw new Error("A filtered property is no longer available")
      predicates.push(child)
    }
  }
  collect(toExplorerFilterGroup(filter))
  // Evaluate one time-dependent predicate first so the canonical Runtime picks
  // the root instant. Logical composition still follows the original AST.
  predicates.sort(
    (left, right) =>
      Number(hasEidosFileCalendarQuery(right.value)) -
      Number(hasEidosFileCalendarQuery(left.value))
  )
  let referenceInstant = calendarExecution?.referenceInstant
  for (const child of predicates) {
    const period = hasEidosFileCalendarQuery(child.value)
    if (period && !calendarExecution)
      throw new Error(
        "Date filters require the application's calendar settings."
      )
    const paths = new Set<string>()
    let offset = 0
    for (;;) {
      const page = await getPage(table.table.id, offset, 500, {
        filter: { type: "group", conjunction: "and", children: [child.value] },
        ...(calendarExecution ? { calendar: calendarExecution.calendar } : {}),
        ...(referenceInstant ? { referenceInstant } : {}),
      })
      if (period && !page.referenceInstant)
        throw new Error(
          "Runtime calendar pages must include their reference instant"
        )
      if (page.referenceInstant) {
        if (referenceInstant && referenceInstant !== page.referenceInstant)
          throw new Error(
            "Runtime changed the Explorer query reference instant"
          )
        referenceInstant = page.referenceInstant
      }
      for (const row of page.rows) {
        const value = row[pathField.tableColumnName]
        if (typeof value === "string") paths.add(value.replace(/^\.\//u, ""))
      }
      offset += page.rows.length
      if (offset >= page.total) break
      if (!page.rows.length)
        throw new Error("Unable to read all filtered file properties")
    }
    matches.set(child.id, paths)
  }
  if (referenceInstant) matches.referenceInstant = referenceInstant
  return matches
}

export async function filterSpaceFiles(
  root: string,
  filter: ExplorerFileFilter,
  directory: string | null,
  execution?: ExplorerCalendarExecution
): Promise<SpaceTreeEntry[]> {
  const { predicates } = compileExplorerFileSystemFilter(filter, execution)
  return filterExplorerEntries(
    await readSpaceFilterTree(root, directory),
    filter,
    undefined,
    predicates.size ? predicates : undefined
  )
}

export async function readSpaceFilterTree(
  root: string,
  directory: string | null,
  respectGitignore = false
): Promise<SpaceTreeEntry[]> {
  const scope = directory ? normalizeMutableRelativePath(directory) : null
  const canonical = await fs.realpath(root)
  const absolute = await resolveSpaceDirectory(canonical, scope)
  const ignoredPaths = respectGitignore
    ? explorerGitignoreFilter(canonical, scope)
    : undefined
  if (await ignoredPaths?.scopeExcluded()) return []
  const entries = await listSpaceTree(absolute, { ignoredPaths })
  const prefix = (items: SpaceTreeEntry[]): SpaceTreeEntry[] =>
    items.map((entry) => ({
      ...entry,
      relativePath: scope
        ? `${scope}/${entry.relativePath}`
        : entry.relativePath,
      ...(entry.children ? { children: prefix(entry.children) } : {}),
    }))
  return prefix(entries)
}
