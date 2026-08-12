import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type SyntheticEvent,
} from "react"
import {
  FileTree,
  useFileTree,
  useFileTreeSelection,
} from "@pierre/trees/react"

import type {
  EidosSyncMergeConflict,
  EidosSyncMergePath,
} from "../shared/contracts"

export interface MergeChangeTreeTarget {
  key: string
  path: EidosSyncMergePath
  table: string | null
  scope: "file" | "table" | "structure"
}

export interface MergeChangeTreeModel {
  paths: string[]
  initialExpandedPaths: string[]
  decorationByPath: Map<string, string>
  targetByTreePath: Map<string, MergeChangeTreeTarget>
  treePathByTarget: Map<string, string>
}

export type MergeConflictsByPath = ReadonlyMap<
  string,
  readonly EidosSyncMergeConflict[]
>

const UNRESOLVED_ROOT = "Merge Conflicts/"
const RESOLVED_ROOT = "Resolved/"

function tableTreeSegment(name: string): string {
  return (name.trim() || "Untitled table")
    .replaceAll("/", "／")
    .replaceAll("\\", "＼")
}

function targetKey(
  path: string,
  table: string | null,
  scope: MergeChangeTreeTarget["scope"]
): string {
  return `${path}\u0000${scope}\u0000${table ?? ""}`
}

interface TableConflictCounts {
  total: number
  resolved: number
  unresolved: number
  rows: number
  schema: number
}

function tableConflictSummary(counts: TableConflictCounts): string {
  if (counts.unresolved === 0) return "✓ Resolved"
  if (counts.schema > 0) {
    return [
      counts.rows > 0
        ? `${counts.rows.toLocaleString()} ${counts.rows === 1 ? "row" : "rows"}`
        : "",
      `${counts.schema.toLocaleString()} schema`,
    ]
      .filter(Boolean)
      .join(" · ")
  }
  if (counts.resolved > 0) {
    return `${counts.unresolved.toLocaleString()} left · ${counts.resolved.toLocaleString()} resolved`
  }
  return `${counts.total.toLocaleString()} ${counts.total === 1 ? "conflict" : "conflicts"}`
}

export function mergeConflictTableName(
  conflict: EidosSyncMergeConflict
): string | null {
  const table = conflict.table?.trim()
  if (table) return table
  if (
    conflict.kind === "schema" &&
    conflict.entryType?.trim().toLowerCase() === "table"
  ) {
    return conflict.name?.trim() || null
  }
  return null
}

export function buildMergeChangeTreeModel(
  mergePaths: readonly EidosSyncMergePath[],
  conflictsByPath: MergeConflictsByPath
): MergeChangeTreeModel {
  const paths = [UNRESOLVED_ROOT, RESOLVED_ROOT]
  const initialExpandedPaths = new Set([UNRESOLVED_ROOT, RESOLVED_ROOT])
  const decorationByPath = new Map<string, string>([
    [
      UNRESOLVED_ROOT,
      String(mergePaths.filter((path) => path.state === "unmerged").length),
    ],
    [
      RESOLVED_ROOT,
      String(mergePaths.filter((path) => path.state === "resolved").length),
    ],
  ])
  const targetByTreePath = new Map<string, MergeChangeTreeTarget>()
  const treePathByTarget = new Map<string, string>()

  for (const path of mergePaths) {
    const root = path.state === "unmerged" ? UNRESOLVED_ROOT : RESOLVED_ROOT
    const conflicts = conflictsByPath.get(path.path) ?? []
    const fileStructureConflicts = conflicts.filter(
      (conflict) =>
        conflict.kind !== "row" && mergeConflictTableName(conflict) === null
    )
    const tableCounts = new Map<string, TableConflictCounts>()
    for (const conflict of conflicts) {
      const table = mergeConflictTableName(conflict)
      if (!table) continue
      const counts = tableCounts.get(table) ?? {
        total: 0,
        resolved: 0,
        unresolved: 0,
        rows: 0,
        schema: 0,
      }
      counts.total += 1
      if (conflict.kind === "row") counts.rows += 1
      else counts.schema += 1
      if (conflict.status === "resolved") counts.resolved += 1
      else counts.unresolved += 1
      tableCounts.set(table, counts)
    }

    const isEidosFile = path.kind === "sqlite_database"
    const hasEidosChildren =
      isEidosFile && (tableCounts.size > 0 || fileStructureConflicts.length > 0)
    const filePath = `${root}${path.path.replace(/\/$/, "")}${isEidosFile ? "/" : ""}`
    const fileTarget: MergeChangeTreeTarget = {
      key: targetKey(path.path, null, "file"),
      path,
      table: null,
      scope: "file",
    }
    paths.push(filePath)
    targetByTreePath.set(filePath, fileTarget)
    treePathByTarget.set(fileTarget.key, filePath)

    if (path.state === "resolved") {
      decorationByPath.set(filePath, "Resolved")
    } else if (tableCounts.size > 0 || fileStructureConflicts.length > 0) {
      const resolvedTables = [...tableCounts.values()].filter(
        (counts) => counts.unresolved === 0
      ).length
      const tableSummary =
        tableCounts.size > 0
          ? resolvedTables > 0
            ? `${resolvedTables} of ${tableCounts.size} resolved`
            : `${tableCounts.size} ${tableCounts.size === 1 ? "table" : "tables"}`
          : ""
      const structureSummary =
        fileStructureConflicts.length > 0
          ? `${fileStructureConflicts.length} structure`
          : ""
      decorationByPath.set(
        filePath,
        [tableSummary, structureSummary].filter(Boolean).join(" · ")
      )
    }

    if (!hasEidosChildren) continue
    initialExpandedPaths.add(filePath)
    let tableIndex = 0
    for (const [table, counts] of tableCounts) {
      let tablePath = `${filePath}${tableTreeSegment(table)}`
      while (targetByTreePath.has(tablePath)) {
        tableIndex += 1
        tablePath = `${filePath}${tableTreeSegment(table)} ${tableIndex + 1}`
      }
      const tableTarget: MergeChangeTreeTarget = {
        key: targetKey(path.path, table, "table"),
        path,
        table,
        scope: "table",
      }
      paths.push(tablePath)
      decorationByPath.set(tablePath, tableConflictSummary(counts))
      targetByTreePath.set(tablePath, tableTarget)
      treePathByTarget.set(tableTarget.key, tablePath)
    }

    if (fileStructureConflicts.length > 0) {
      let structurePath = `${filePath}File structure`
      let structureIndex = 1
      while (targetByTreePath.has(structurePath)) {
        structureIndex += 1
        structurePath = `${filePath}File structure ${structureIndex}`
      }
      const structureTarget: MergeChangeTreeTarget = {
        key: targetKey(path.path, null, "structure"),
        path,
        table: null,
        scope: "structure",
      }
      paths.push(structurePath)
      decorationByPath.set(
        structurePath,
        `${fileStructureConflicts.length} ${fileStructureConflicts.length === 1 ? "conflict" : "conflicts"}`
      )
      targetByTreePath.set(structurePath, structureTarget)
      treePathByTarget.set(structureTarget.key, structurePath)
    }
  }

  return {
    paths,
    initialExpandedPaths: [...initialExpandedPaths],
    decorationByPath,
    targetByTreePath,
    treePathByTarget,
  }
}

function eventTreePath(event: SyntheticEvent<HTMLElement>): string | null {
  for (const target of event.nativeEvent.composedPath()) {
    if (!(target instanceof HTMLElement)) continue
    const path = target.dataset.itemPath
    if (path) return path
  }
  return null
}

function parentTreePaths(path: string): string[] {
  const segments = path.replace(/\/$/, "").split("/")
  return segments
    .slice(0, -1)
    .map((_, index) => `${segments.slice(0, index + 1).join("/")}/`)
}

const TREE_CSS = `
  :host {
    display: block;
    min-height: 0;
  }

  [data-file-tree-virtualized-scroll="true"] {
    padding-block: 3px 8px;
  }

  button[data-type="item"] {
    border-radius: 3px;
  }

  button[data-type="item"]:focus-visible {
    outline-offset: -1px;
  }

  button[data-type="item"][data-item-path="Merge Conflicts/"],
  button[data-type="item"][data-item-path="Resolved/"] {
    font-weight: 650;
  }

  button[data-type="item"][data-item-path^="Merge Conflicts/"]
    [data-item-section="decoration"] {
    color: var(--warning);
  }

  button[data-type="item"][data-item-path^="Resolved/"]
    [data-item-section="decoration"] {
    color: var(--success);
  }

  [data-item-section="decoration"] {
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
`

export function MergeChangeTree({
  paths,
  conflictsByPath,
  selectedPath,
  selectedTable,
  selectedScope,
  onSelect,
}: {
  paths: readonly EidosSyncMergePath[]
  conflictsByPath: MergeConflictsByPath
  selectedPath: string | null
  selectedTable: string | null
  selectedScope: MergeChangeTreeTarget["scope"]
  onSelect(target: MergeChangeTreeTarget): void
}) {
  const tree = useMemo(
    () => buildMergeChangeTreeModel(paths, conflictsByPath),
    [conflictsByPath, paths]
  )
  const treeRef = useRef(tree)
  treeRef.current = tree
  const decorationRef = useRef(tree.decorationByPath)
  decorationRef.current = tree.decorationByPath
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const treeSignature = tree.paths.join("\u0000")
  const selectedKey = selectedPath
    ? (tree.treePathByTarget.get(
        targetKey(selectedPath, selectedTable, selectedScope)
      ) ??
      tree.treePathByTarget.get(targetKey(selectedPath, null, "file")) ??
      null)
    : null
  const { model } = useFileTree({
    paths: [],
    density: 1,
    itemHeight: 26,
    initialExpansion: "closed",
    flattenEmptyDirectories: false,
    icons: { set: "standard", colored: false },
    stickyFolders: false,
    unsafeCSS: TREE_CSS,
    renderRowDecoration: ({ item }) => {
      const text = decorationRef.current.get(item.path)
      return text ? { text, title: text } : null
    },
  })
  const selectedPaths = useFileTreeSelection(model)

  useEffect(() => {
    const current = treeRef.current
    model.resetPaths(current.paths, {
      initialExpandedPaths: current.initialExpandedPaths,
    })
  }, [model, treeSignature])

  useEffect(() => {
    if (!selectedKey) return
    for (const parentPath of parentTreePaths(selectedKey)) {
      const parent = model.getItem(parentPath)
      if (parent && "expand" in parent && !parent.isExpanded()) parent.expand()
    }
    const item = model.getItem(selectedKey)
    if (!item) return
    for (const path of model.getSelectedPaths()) {
      if (path !== selectedKey) model.getItem(path)?.deselect()
    }
    if (!item.isSelected()) item.select()
    model.scrollToPath(selectedKey, { offset: "nearest", focus: false })
  }, [model, selectedKey, treeSignature])

  const selectTreePath = (treePath: string | null) => {
    if (!treePath) return
    const target = treeRef.current.targetByTreePath.get(treePath)
    if (target) onSelectRef.current(target)
  }

  const styles = {
    height: "100%",
    minHeight: 0,
    width: "100%",
    colorScheme: "inherit",
    "--trees-bg-override": "transparent",
    "--trees-bg-muted-override": "var(--surface-hover)",
    "--trees-border-color-override": "var(--line)",
    "--trees-fg-override": "var(--ink)",
    "--trees-fg-muted-override": "var(--ink-muted)",
    "--trees-font-family-override": "inherit",
    "--trees-font-size-override": "11px",
    "--trees-focus-ring-color-override": "var(--focus)",
    "--trees-focus-ring-offset-override": "-1px",
    "--trees-focus-ring-width-override": "1px",
    "--trees-icon-width-override": "14px",
    "--trees-item-margin-x-override": "4px",
    "--trees-item-row-gap-override": "4px",
    "--trees-item-padding-x-override": "5px",
    "--trees-level-gap-override": "10px",
    "--trees-padding-inline-override": "4px",
    "--trees-selected-bg-override": "var(--surface-selected)",
    "--trees-selected-fg-override": "var(--ink)",
  } as CSSProperties

  return (
    <FileTree
      model={model}
      aria-label="Merge conflict files and tables"
      className="merge-change-tree"
      data-merge-change-tree="true"
      data-selected-path={selectedPath ?? undefined}
      data-selected-table={selectedTable ?? undefined}
      data-active-selected={
        selectedKey && selectedPaths.includes(selectedKey) ? "true" : "false"
      }
      style={styles}
      onClick={(event) => selectTreePath(eventTreePath(event))}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        selectTreePath(eventTreePath(event) ?? model.getFocusedPath())
      }}
    />
  )
}
