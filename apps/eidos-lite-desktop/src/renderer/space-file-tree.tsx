import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from "react"
import type { FileTreeDropContext, FileTreeDropTarget } from "@pierre/trees"
import {
  FileTree,
  useFileTree,
  useFileTreeSelection,
} from "@pierre/trees/react"

import type { SpaceTreeEntry } from "../shared/contracts"

interface SpaceFileTreeProps {
  entries: SpaceTreeEntry[]
  activePath: string | null
  disabled?: boolean
  onSelect(entry: SpaceTreeEntry): void
  onOpen(entry: SpaceTreeEntry): void
  onLoadDirectory(relativePath: string): void
  onMove(relativePath: string, targetDirectory: string | null): Promise<void>
  onMoveError(error: unknown): void
  onContextMenu(entry: SpaceTreeEntry, x: number, y: number): void
}

export interface SpaceFileTreeModel {
  paths: string[]
  initialExpandedPaths: string[]
  entryByTreePath: Map<string, SpaceTreeEntry>
}

export function parentTreePaths(relativePath: string): string[] {
  const segments = relativePath.split("/")
  return segments
    .slice(0, -1)
    .map((_, index) => `${segments.slice(0, index + 1).join("/")}/`)
}

export function relativePathFromTreePath(treePath: string): string {
  return treePath.endsWith("/") ? treePath.slice(0, -1) : treePath
}

export function dropTargetDirectory(target: FileTreeDropTarget): string | null {
  return target.kind === "root" || target.directoryPath === null
    ? null
    : relativePathFromTreePath(target.directoryPath)
}

function parentTreeDirectory(treePath: string): string | null {
  const relativePath = relativePathFromTreePath(treePath)
  const separator = relativePath.lastIndexOf("/")
  return separator < 0 ? null : `${relativePath.slice(0, separator)}/`
}

export function canMoveTreeDrop(context: FileTreeDropContext): boolean {
  if (context.draggedPaths.length !== 1) return false
  const sourcePath = context.draggedPaths[0]
  if (!sourcePath) return false
  const targetDirectory =
    context.target.kind === "root" ? null : context.target.directoryPath
  return parentTreeDirectory(sourcePath) !== targetDirectory
}

function toTreePath(entry: SpaceTreeEntry): string {
  return entry.kind === "directory"
    ? `${entry.relativePath.replace(/\/$/, "")}/`
    : entry.relativePath
}

function eventTreePath(event: SyntheticEvent<HTMLElement>): string | null {
  for (const target of event.nativeEvent.composedPath()) {
    if (!(target instanceof HTMLElement)) continue
    const path = target.dataset.itemPath
    if (path) return path
  }
  return null
}

export function buildSpaceFileTreeModel(
  entries: SpaceTreeEntry[]
): SpaceFileTreeModel {
  const paths: string[] = []
  const initialExpandedPaths: string[] = []
  const entryByTreePath = new Map<string, SpaceTreeEntry>()

  const visit = (entry: SpaceTreeEntry, depth: number) => {
    const treePath = toTreePath(entry)
    paths.push(treePath)
    entryByTreePath.set(treePath, entry)
    if (
      entry.kind === "directory" &&
      depth === 0 &&
      entry.childrenLoaded !== false
    ) {
      initialExpandedPaths.push(treePath)
    }
    entry.children?.forEach((child) => visit(child, depth + 1))
  }

  entries.forEach((entry) => visit(entry, 0))
  return { paths, initialExpandedPaths, entryByTreePath }
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

  button[data-type="item"][data-item-dragging] {
    opacity: 0.45;
  }

  button[data-type="item"][data-item-drag-target] {
    background: var(--surface-selected);
    box-shadow: inset 0 0 0 1px var(--focus);
  }
`

export function SpaceFileTree({
  entries,
  activePath,
  disabled,
  onSelect,
  onOpen,
  onLoadDirectory,
  onMove,
  onMoveError,
  onContextMenu,
}: SpaceFileTreeProps) {
  const [treeResetVersion, setTreeResetVersion] = useState(0)
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled
  const mutationInFlightRef = useRef(false)
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onLoadDirectoryRef = useRef(onLoadDirectory)
  onLoadDirectoryRef.current = onLoadDirectory
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove
  const onMoveErrorRef = useRef(onMoveError)
  onMoveErrorRef.current = onMoveError
  const onContextMenuRef = useRef(onContextMenu)
  onContextMenuRef.current = onContextMenu
  const tree = useMemo(() => buildSpaceFileTreeModel(entries), [entries])
  const treeSignature = tree.paths.join("\u0000")
  const treeRef = useRef(tree)
  treeRef.current = tree

  const { model } = useFileTree({
    paths: [],
    density: 1,
    itemHeight: 28,
    initialExpansion: "closed",
    flattenEmptyDirectories: false,
    icons: { set: "standard", colored: false },
    stickyFolders: false,
    unsafeCSS: TREE_CSS,
    dragAndDrop: {
      canDrag: (paths) =>
        disabledRef.current !== true &&
        mutationInFlightRef.current === false &&
        paths.length === 1 &&
        treeRef.current.entryByTreePath.has(paths[0] ?? ""),
      canDrop: (context) =>
        disabledRef.current !== true &&
        mutationInFlightRef.current === false &&
        canMoveTreeDrop(context),
      onDropComplete: ({ draggedPaths, target }) => {
        const sourcePath = draggedPaths[0]
        if (!sourcePath) return
        mutationInFlightRef.current = true
        void onMoveRef
          .current(
            relativePathFromTreePath(sourcePath),
            dropTargetDirectory(target)
          )
          .catch((cause) => {
            setTreeResetVersion((current) => current + 1)
            onMoveErrorRef.current(cause)
          })
          .finally(() => {
            mutationInFlightRef.current = false
          })
      },
      onDropError: (message) => {
        setTreeResetVersion((current) => current + 1)
        onMoveErrorRef.current(new Error(message))
      },
    },
  })
  const selectedPaths = useFileTreeSelection(model)

  useEffect(() => {
    model.resetPaths(tree.paths, {
      initialExpandedPaths: tree.initialExpandedPaths,
    })
  }, [model, treeResetVersion, treeSignature])

  useEffect(() => {
    if (!activePath) return
    for (const parentPath of parentTreePaths(activePath)) {
      const parent = model.getItem(parentPath)
      if (parent && "expand" in parent && !parent.isExpanded()) parent.expand()
    }
    const item = model.getItem(activePath)
    if (!item) return
    for (const selectedPath of model.getSelectedPaths()) {
      if (selectedPath !== activePath) model.getItem(selectedPath)?.deselect()
    }
    if (!item.isSelected()) item.select()
    model.scrollToPath(activePath, { offset: "nearest", focus: false })
  }, [activePath, model, treeSignature])

  const openTreePath = (treePath: string | null) => {
    if (!treePath || disabled) return
    const entry = treeRef.current.entryByTreePath.get(treePath)
    if (!entry) return
    onSelectRef.current(entry)
    if (entry.kind === "directory") {
      if (!entry.childrenLoaded) {
        onLoadDirectoryRef.current(entry.relativePath)
      }
    } else {
      onOpenRef.current(entry)
    }
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
    "--trees-font-size-override": "12px",
    "--trees-focus-ring-color-override": "var(--focus)",
    "--trees-focus-ring-offset-override": "-1px",
    "--trees-focus-ring-width-override": "1px",
    "--trees-action-lane-width-override": "22px",
    "--trees-icon-width-override": "15px",
    "--trees-item-margin-x-override": "4px",
    "--trees-item-row-gap-override": "5px",
    "--trees-item-padding-x-override": "5px",
    "--trees-level-gap-override": "11px",
    "--trees-padding-inline-override": "5px",
    "--trees-selected-bg-override": "var(--surface-selected)",
    "--trees-selected-fg-override": "var(--ink)",
  } as CSSProperties

  return (
    <FileTree
      model={model}
      aria-label="Space files"
      aria-disabled={disabled === true}
      className="space-file-tree"
      data-space-file-tree="true"
      data-active-path={activePath ?? undefined}
      data-active-selected={
        activePath && selectedPaths.includes(activePath) ? "true" : "false"
      }
      style={styles}
      onClick={(event) => openTreePath(eventTreePath(event))}
      onContextMenu={(event) => {
        const treePath = eventTreePath(event)
        if (!treePath || disabled) return
        const entry = treeRef.current.entryByTreePath.get(treePath)
        if (!entry) return
        event.preventDefault()
        onSelectRef.current(entry)
        onContextMenuRef.current(entry, event.clientX, event.clientY)
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        openTreePath(eventTreePath(event) ?? model.getFocusedPath())
      }}
    />
  )
}
