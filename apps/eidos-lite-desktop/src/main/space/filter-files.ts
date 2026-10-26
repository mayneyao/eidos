import fs from "node:fs/promises"
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
  type ExplorerFileFilter,
} from "../../shared/explorer-file-filter"
import {
  listSpaceTree,
  normalizeMutableRelativePath,
  resolveSpaceDirectory,
} from "./space-paths"

/** Property comparisons stay in the canonical Runtime, including dates and list membership. */
export async function explorerPropertyMatches(
  filter: ExplorerFileFilter,
  table: EidosFileTableSnapshot,
  getPage: EidosFileDataSource["getPage"]
): Promise<Map<string, ReadonlySet<string>>> {
  const matches = new Map<string, ReadonlySet<string>>()
  const pathField = table.fields.find(
    (field) => field.name === "path" && field.settings?.isSystem === true
  )
  if (!pathField) throw new Error("File properties are unavailable")
  const visit = async (group: ExplorerFilterGroup): Promise<void> => {
    for (const child of group.children) {
      if (child.type === "group") {
        await visit(child)
        continue
      }
      if (child.field !== "property" || !isExplorerRuleActive(child)) continue
      if (
        !table.fields.some(
          (field) =>
            field.id === child.value.field &&
            field.settings?.isSystem !== true &&
            !field.isHidden
        )
      )
        throw new Error("A filtered property is no longer available")
      const paths = new Set<string>()
      let offset = 0
      for (;;) {
        const page = await getPage(table.table.id, offset, 500, {
          filter: {
            type: "group",
            conjunction: "and",
            children: [child.value],
          },
        })
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
  }
  await visit(toExplorerFilterGroup(filter))
  return matches
}

export async function filterSpaceFiles(
  root: string,
  filter: ExplorerFileFilter,
  directory: string | null
): Promise<SpaceTreeEntry[]> {
  return filterExplorerEntries(
    await readSpaceFilterTree(root, directory),
    filter
  )
}

export async function readSpaceFilterTree(
  root: string,
  directory: string | null
): Promise<SpaceTreeEntry[]> {
  const scope = directory ? normalizeMutableRelativePath(directory) : null
  const absolute = await resolveSpaceDirectory(await fs.realpath(root), scope)
  const entries = await listSpaceTree(absolute)
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
