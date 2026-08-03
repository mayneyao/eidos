import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type SyntheticEvent,
} from "react"
import type { GitStatus, GitStatusEntry } from "@pierre/trees"
import {
  FileTree,
  useFileTree,
  useFileTreeSelection,
} from "@pierre/trees/react"

import type {
  SpaceVersionCommit,
  SpaceVersionDiff,
  SpaceVersionFileDiff,
  SpaceVersionPathChange,
  SpaceVersionTableDiff,
} from "../shared/contracts"

export type VersionInspection =
  | {
      type: "file"
      key: string
      mode: "changes" | "history"
      diff: SpaceVersionDiff
      change: SpaceVersionPathChange
      file: SpaceVersionFileDiff | null
      commit: SpaceVersionCommit | null
      loadingDetails?: boolean
      detailsError?: string
    }
  | {
      type: "table"
      key: string
      mode: "changes" | "history"
      diff: SpaceVersionDiff
      change: SpaceVersionPathChange
      file: SpaceVersionFileDiff
      table: SpaceVersionTableDiff
      commit: SpaceVersionCommit | null
      loadingDetails?: boolean
      detailsError?: string
    }

interface VersionTreeTarget {
  key: string
  change: SpaceVersionPathChange
  file: SpaceVersionFileDiff | null
  table: SpaceVersionTableDiff | null
}

export interface VersionChangeTreeModel {
  paths: string[]
  initialExpandedPaths: string[]
  gitStatus: GitStatusEntry[]
  decorationByPath: Map<string, string>
  targetByTreePath: Map<string, VersionTreeTarget>
}

export function versionChangeTreeStructureKey(
  paths: readonly string[]
): string {
  return paths.join("\u0000")
}

function isEidosPath(path: string): boolean {
  return path.toLocaleLowerCase().endsWith(".eidos")
}

function treeGitStatus(change: string): GitStatus {
  switch (change.toLocaleLowerCase()) {
    case "added":
    case "created":
    case "new":
      return "added"
    case "deleted":
    case "removed":
      return "deleted"
    case "renamed":
    case "moved":
      return "renamed"
    case "untracked":
      return "untracked"
    default:
      return "modified"
  }
}

function tableChangeSummary(table: SpaceVersionTableDiff): string {
  if (table.summary) {
    return [
      table.summary.inserts ? `+${table.summary.inserts}` : "",
      table.summary.deletes ? `−${table.summary.deletes}` : "",
      table.summary.updates ? `~${table.summary.updates}` : "",
    ]
      .filter(Boolean)
      .join(" ")
  }
  let inserts = 0
  let deletes = 0
  let updates = 0
  for (const change of table.changes) {
    switch (change.op.toLocaleLowerCase()) {
      case "insert":
        inserts += 1
        break
      case "delete":
        deletes += 1
        break
      default:
        updates += 1
        break
    }
  }
  return [
    inserts ? `+${inserts}` : "",
    deletes ? `−${deletes}` : "",
    updates ? `~${updates}` : "",
  ]
    .filter(Boolean)
    .join(" ")
}

function tableTreeSegment(name: string): string {
  return (name.trim() || "Untitled table")
    .replace(/\//g, "／")
    .replace(/\\/g, "＼")
}

function topLevelParent(path: string): string | null {
  const slash = path.indexOf("/")
  return slash < 0 ? null : `${path.slice(0, slash)}/`
}

export function buildVersionChangeTreeModel(
  diff: SpaceVersionDiff
): VersionChangeTreeModel {
  const paths: string[] = []
  const initialExpandedPaths = new Set<string>()
  const gitStatus: GitStatusEntry[] = []
  const decorationByPath = new Map<string, string>()
  const targetByTreePath = new Map<string, VersionTreeTarget>()
  const fileByPath = new Map(diff.files.map((file) => [file.path, file]))
  const changeByPath = new Map(
    diff.paths.map((change) => [change.path, change])
  )

  for (const file of diff.files) {
    if (!changeByPath.has(file.path)) changeByPath.set(file.path, file)
  }

  for (const change of changeByPath.values()) {
    const file = fileByPath.get(change.path) ?? null
    const eidos = isEidosPath(change.path)
    const treePath = eidos ? `${change.path.replace(/\/$/, "")}/` : change.path
    paths.push(treePath)
    gitStatus.push({ path: treePath, status: treeGitStatus(change.change) })
    targetByTreePath.set(treePath, {
      key: treePath,
      change,
      file,
      table: null,
    })

    const parent = topLevelParent(change.path)
    if (parent) initialExpandedPaths.add(parent)

    if (!eidos || !file) continue
    if (file.tables.length) {
      initialExpandedPaths.add(treePath)
      decorationByPath.set(
        treePath,
        `${file.tables.length} ${file.tables.length === 1 ? "table" : "tables"}`
      )
    }
    file.tables.forEach((table, index) => {
      let tablePath = `${treePath}${tableTreeSegment(table.name)}`
      while (targetByTreePath.has(tablePath)) tablePath += ` ${index + 1}`
      paths.push(tablePath)
      const summary = tableChangeSummary(table)
      if (summary) decorationByPath.set(tablePath, summary)
      targetByTreePath.set(tablePath, {
        key: tablePath,
        change,
        file,
        table,
      })
    })
  }

  return {
    paths,
    initialExpandedPaths: [...initialExpandedPaths],
    gitStatus,
    decorationByPath,
    targetByTreePath,
  }
}

export function versionInspectionFromTarget(
  target: VersionTreeTarget,
  diff: SpaceVersionDiff,
  mode: "changes" | "history",
  commit: SpaceVersionCommit | null
): VersionInspection {
  return target.table && target.file
    ? {
        type: "table",
        key: target.key,
        mode,
        diff,
        change: target.change,
        file: target.file,
        table: target.table,
        commit,
      }
    : {
        type: "file",
        key: target.key,
        mode,
        diff,
        change: target.change,
        file: target.file,
        commit,
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

  [data-item-section="decoration"] {
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
`

export function VersionChangeTree({
  diff,
  selectedKey,
  mode,
  commit = null,
  onSelect,
}: {
  diff: SpaceVersionDiff
  selectedKey: string | null
  mode: "changes" | "history"
  commit?: SpaceVersionCommit | null
  onSelect(inspection: VersionInspection): void
}) {
  const tree = useMemo(() => buildVersionChangeTreeModel(diff), [diff])
  const treeRef = useRef(tree)
  treeRef.current = tree
  const decorationRef = useRef(tree.decorationByPath)
  decorationRef.current = tree.decorationByPath
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const treeSignature = versionChangeTreeStructureKey(tree.paths)
  const gitStatusSignature = tree.gitStatus
    .map(({ path, status }) => `${path}\u0000${status}`)
    .join("\u0000")

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
    const currentTree = treeRef.current
    model.resetPaths(currentTree.paths, {
      initialExpandedPaths: currentTree.initialExpandedPaths,
    })
  }, [model, treeSignature])

  useEffect(() => {
    model.setGitStatus(treeRef.current.gitStatus)
  }, [gitStatusSignature, model])

  useEffect(() => {
    if (!selectedKey) return
    for (const parentPath of parentTreePaths(selectedKey)) {
      const parent = model.getItem(parentPath)
      if (parent && "expand" in parent && !parent.isExpanded()) parent.expand()
    }
    const item = model.getItem(selectedKey)
    if (!item) return
    for (const selectedPath of model.getSelectedPaths()) {
      if (selectedPath !== selectedKey) model.getItem(selectedPath)?.deselect()
    }
    if (!item.isSelected()) item.select()
    model.scrollToPath(selectedKey, { offset: "nearest", focus: false })
  }, [model, selectedKey, treeSignature])

  const inspectTreePath = (treePath: string | null) => {
    if (!treePath) return
    const target = treeRef.current.targetByTreePath.get(treePath)
    if (!target) return
    onSelectRef.current(versionInspectionFromTarget(target, diff, mode, commit))
  }

  const styles = {
    height: "100%",
    minHeight: 0,
    width: "100%",
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
    "--trees-git-modified-color-override": "var(--lite-accent)",
    "--trees-git-added-color-override": "var(--success)",
    "--trees-git-deleted-color-override": "var(--danger)",
    "--trees-git-renamed-color-override": "oklch(0.62 0.13 70)",
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
      aria-label={mode === "changes" ? "Changed Space files" : "Version files"}
      className="version-change-tree"
      data-version-change-tree="true"
      data-selected-key={selectedKey ?? undefined}
      data-active-selected={
        selectedKey && selectedPaths.includes(selectedKey) ? "true" : "false"
      }
      style={styles}
      onClick={(event) => inspectTreePath(eventTreePath(event))}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        inspectTreePath(eventTreePath(event) ?? model.getFocusedPath())
      }}
    />
  )
}
