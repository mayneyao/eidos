import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from "react"
import type {
  FileTreeDropContext,
  FileTreeDropTarget,
  FileTreeItemHandle,
} from "@pierre/trees"
import {
  FileTree,
  useFileTree,
  useFileTreeSelection,
} from "@pierre/trees/react"

import type { SpaceTreeEntry } from "../shared/contracts"
import { EIDOS_FILE_TREE_ICONS } from "./file-tree-icons"
import { hasSpacePathDragData, setSpacePathDragData } from "./space-path-drag"
import { useEidosLiteI18n } from "./i18n"

interface SpaceFileTreeProps {
  entries: SpaceTreeEntry[]
  activePath: string | null
  revealToken?: number
  disabled?: boolean
  renameRequest: SpaceTreeRenameRequest | null
  onSelect(entry: SpaceTreeEntry | null): void
  onOpen(entry: SpaceTreeEntry): void
  onLoadDirectory(relativePath: string): Promise<void>
  onMove(relativePaths: string[], targetDirectory: string | null): Promise<void>
  onMoveError(error: unknown): void
  onImportFiles?(files: File[], targetDirectory: string | null): Promise<void>
  onRename(entry: SpaceTreeEntry, nextName: string): Promise<void>
  onRenameError(error: unknown): void
  onContextMenu(
    entry: SpaceTreeEntry,
    x: number,
    y: number,
    selectedEntries: SpaceTreeEntry[]
  ): void
}

export interface SpaceTreeRenameRequest {
  treePath: string
  nonce: number
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

/**
 * Shift and Command/Control clicks drive the tree's own range/toggle
 * multi-selection. They must not also open the clicked file, because changing
 * the active document reveals that path and clears the multi-selection.
 */
export function isTreeMultiSelectClick(event: {
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}): boolean {
  return event.shiftKey || event.metaKey || event.ctrlKey
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
  if (context.draggedPaths.length === 0) return false
  const targetDirectory =
    context.target.kind === "root" ? null : context.target.directoryPath
  return context.draggedPaths.every(
    (sourcePath) =>
      Boolean(sourcePath) &&
      parentTreeDirectory(sourcePath) !== targetDirectory &&
      (targetDirectory === null ||
        !sourcePath.endsWith("/") ||
        (targetDirectory !== sourcePath &&
          !targetDirectory.startsWith(sourcePath)))
  )
}

export function externalDropTargetDirectory(
  treePath: string | null
): string | null {
  if (!treePath) return null
  return treePath.endsWith("/")
    ? relativePathFromTreePath(treePath)
    : (parentTreeDirectory(treePath)?.replace(/\/$/, "") ?? null)
}

export function topLevelSelectedEntries(
  entries: SpaceTreeEntry[]
): SpaceTreeEntry[] {
  return entries.filter(
    (entry) =>
      !entries.some(
        (other) =>
          other.kind === "directory" &&
          other.relativePath !== entry.relativePath &&
          entry.relativePath.startsWith(`${other.relativePath}/`)
      )
  )
}

function toTreePath(entry: SpaceTreeEntry): string {
  return entry.kind === "directory"
    ? `${entry.relativePath.replace(/\/$/, "")}/`
    : entry.relativePath
}

function treePathLeafName(treePath: string): string {
  const bare = treePath.endsWith("/") ? treePath.slice(0, -1) : treePath
  const separator = bare.lastIndexOf("/")
  return separator < 0 ? bare : bare.slice(separator + 1)
}

function sortedPathsSignature(paths: readonly string[]): string {
  return [...paths].sort().join("\u0000")
}

interface FileTreeExpansionReader {
  getItem(path: string): FileTreeItemHandle | null
}

export function preservedExpandedTreePaths(
  nextPaths: readonly string[],
  model: FileTreeExpansionReader
): string[] {
  return nextPaths.filter((path) => {
    if (!path.endsWith("/")) return false
    const item = model.getItem(path)
    return item !== null && "isExpanded" in item && item.isExpanded()
  })
}

export function remappedTreePaths(
  paths: readonly string[],
  sourceTreePath: string,
  destinationTreePath: string
): string[] {
  const isFolder = sourceTreePath.endsWith("/")
  return paths.map((path) =>
    path === sourceTreePath || (isFolder && path.startsWith(sourceTreePath))
      ? `${destinationTreePath}${path.slice(sourceTreePath.length)}`
      : path
  )
}

function droppedTreePath(
  sourceTreePath: string,
  target: FileTreeDropTarget
): string {
  const isFolder = sourceTreePath.endsWith("/")
  const targetDirectory = dropTargetDirectory(target)
  const destination = targetDirectory
    ? `${targetDirectory}/${treePathLeafName(sourceTreePath)}`
    : treePathLeafName(sourceTreePath)
  return isFolder ? `${destination}/` : destination
}

function eventTreePath(event: SyntheticEvent<HTMLElement>): string | null {
  for (const target of event.nativeEvent.composedPath()) {
    if (!(target instanceof HTMLElement)) continue
    const path = target.dataset.itemPath
    if (path) return path
  }
  return null
}

function eventTargetsRenameInput(event: SyntheticEvent<HTMLElement>): boolean {
  return event.nativeEvent
    .composedPath()
    .some(
      (target) =>
        target instanceof HTMLElement &&
        target.dataset.itemRenameInput !== undefined
    )
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

  button[data-type="item"][data-external-drop-target] {
    background: var(--surface-selected);
    box-shadow: inset 0 0 0 1px var(--focus);
  }
`

export const SPACE_FILE_TREE_STYLES = {
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

export function SpaceFileTree({
  entries,
  activePath,
  revealToken = 0,
  disabled,
  renameRequest,
  onSelect,
  onOpen,
  onLoadDirectory,
  onMove,
  onMoveError,
  onImportFiles,
  onRename,
  onRenameError,
  onContextMenu,
}: SpaceFileTreeProps) {
  const { t } = useEidosLiteI18n()
  const [treeResetVersion, setTreeResetVersion] = useState(0)
  const [externalDropActive, setExternalDropActive] = useState(false)
  const [externalDropDirectory, setExternalDropDirectory] = useState<
    string | null
  >(null)
  const [directoryLoads, setDirectoryLoads] = useState<
    Record<string, { state: "loading" | "error"; message?: string }>
  >({})
  const directoryLoadsRef = useRef(directoryLoads)
  directoryLoadsRef.current = directoryLoads
  const externalDropRowRef = useRef<HTMLElement | null>(null)
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
  const onRenameRef = useRef(onRename)
  onRenameRef.current = onRename
  const onRenameErrorRef = useRef(onRenameError)
  onRenameErrorRef.current = onRenameError
  const onContextMenuRef = useRef(onContextMenu)
  onContextMenuRef.current = onContextMenu
  const tree = useMemo(() => buildSpaceFileTreeModel(entries), [entries])
  const treeSignature = tree.paths.join("\u0000")
  const treeRef = useRef(tree)
  treeRef.current = tree
  const appliedPathsSignatureRef = useRef<string | null>(null)
  const treeInitializedRef = useRef(false)

  const { model } = useFileTree({
    paths: [],
    density: 1,
    itemHeight: 28,
    initialExpansion: "closed",
    flattenEmptyDirectories: false,
    icons: EIDOS_FILE_TREE_ICONS,
    stickyFolders: false,
    unsafeCSS: TREE_CSS,
    dragAndDrop: {
      canDrag: (paths) =>
        disabledRef.current !== true &&
        mutationInFlightRef.current === false &&
        paths.length > 0 &&
        paths.every((path) => treeRef.current.entryByTreePath.has(path)),
      canDrop: (context) =>
        disabledRef.current !== true &&
        mutationInFlightRef.current === false &&
        canMoveTreeDrop(context),
      onDropComplete: ({ draggedPaths, target }) => {
        if (draggedPaths.length === 0) return
        mutationInFlightRef.current = true
        appliedPathsSignatureRef.current = sortedPathsSignature(
          draggedPaths.reduce(
            (paths, sourcePath) =>
              remappedTreePaths(
                paths,
                sourcePath,
                droppedTreePath(sourcePath, target)
              ),
            treeRef.current.paths
          )
        )
        void onMoveRef
          .current(
            draggedPaths.map(relativePathFromTreePath),
            dropTargetDirectory(target)
          )
          .catch((cause) => {
            appliedPathsSignatureRef.current = null
            setTreeResetVersion((current) => current + 1)
            onMoveErrorRef.current(cause)
          })
          .finally(() => {
            mutationInFlightRef.current = false
          })
      },
      onDropError: (message) => {
        appliedPathsSignatureRef.current = null
        setTreeResetVersion((current) => current + 1)
        onMoveErrorRef.current(new Error(message))
      },
    },
    renaming: {
      canRename: (item) =>
        disabledRef.current !== true &&
        mutationInFlightRef.current === false &&
        treeRef.current.entryByTreePath.has(
          item.isFolder ? `${item.path}/` : item.path
        ),
      onError: (message) => onRenameErrorRef.current(new Error(message)),
      onRename: ({ sourcePath, destinationPath, isFolder }) => {
        const sourceTreePath = isFolder ? `${sourcePath}/` : sourcePath
        const entry = treeRef.current.entryByTreePath.get(sourceTreePath)
        if (!entry) return
        const destinationTreePath = isFolder
          ? `${destinationPath}/`
          : destinationPath
        mutationInFlightRef.current = true
        appliedPathsSignatureRef.current = sortedPathsSignature(
          remappedTreePaths(
            treeRef.current.paths,
            sourceTreePath,
            destinationTreePath
          )
        )
        void onRenameRef
          .current(entry, treePathLeafName(destinationPath))
          .catch((cause) => {
            appliedPathsSignatureRef.current = null
            setTreeResetVersion((current) => current + 1)
            onRenameErrorRef.current(cause)
          })
          .finally(() => {
            mutationInFlightRef.current = false
          })
      },
    },
  })
  const selectedPaths = useFileTreeSelection(model)
  const selectedPathsSignature = selectedPaths.join("\u0000")
  useEffect(() => {
    const selectedEntries = selectedPaths.flatMap((path) => {
      const entry = treeRef.current.entryByTreePath.get(path)
      return entry ? [entry] : []
    })
    const topLevelEntries = topLevelSelectedEntries(selectedEntries)
    if (topLevelEntries.length < selectedEntries.length) {
      const keptPaths = new Set(topLevelEntries.map(toTreePath))
      for (const path of selectedPaths) {
        if (!keptPaths.has(path)) model.getItem(path)?.deselect()
      }
      return
    }
    onSelectRef.current(
      selectedEntries.length === 1 ? selectedEntries[0]! : null
    )
  }, [model, selectedPathsSignature])
  useEffect(() => {
    model.setGitStatus(
      [...tree.entryByTreePath.entries()]
        .filter(([, entry]) => entry.ignored)
        .map(([path]) => ({ path, status: "ignored" as const }))
    )
  }, [model, tree])
  useEffect(() => {
    model.setRowDecoration(({ item }) => {
      const status = directoryLoads[item.path]
      if (!status || tree.entryByTreePath.get(item.path)?.childrenLoaded)
        return null
      return status.state === "loading"
        ? { text: t("Loading…"), title: t("Loading folder…") }
        : { text: t("Retry"), title: status.message }
    })
  }, [directoryLoads, model, t, tree])
  const activeRevealRef = useRef({
    model,
    path: activePath,
    revealToken,
    revealed: false,
  })

  useEffect(() => {
    const signature = sortedPathsSignature(tree.paths)
    if (appliedPathsSignatureRef.current === signature) return
    const expandedPaths = treeInitializedRef.current
      ? preservedExpandedTreePaths(tree.paths, model)
      : tree.initialExpandedPaths
    model.resetPaths(tree.paths, {
      initialExpandedPaths: expandedPaths,
    })
    treeInitializedRef.current = true
    appliedPathsSignatureRef.current = signature
  }, [model, treeResetVersion, treeSignature])

  useEffect(() => {
    if (!renameRequest) return
    model.startRenaming(renameRequest.treePath)
  }, [model, renameRequest])

  useEffect(() => {
    if (
      activeRevealRef.current.model !== model ||
      activeRevealRef.current.path !== activePath ||
      activeRevealRef.current.revealToken !== revealToken
    ) {
      activeRevealRef.current = {
        model,
        path: activePath,
        revealToken,
        revealed: false,
      }
    }
    // Directory hydration also changes treeSignature. Reveal once per document
    // navigation, so browsing folders cannot pull the viewport back to the editor.
    if (activeRevealRef.current.revealed) return
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
    activeRevealRef.current.revealed = true
  }, [activePath, model, treeSignature, revealToken])

  const openTreePath = (treePath: string | null) => {
    if (!treePath || disabled) return
    const entry = treeRef.current.entryByTreePath.get(treePath)
    if (!entry) return
    onSelectRef.current(entry)
    if (entry.kind === "directory") {
      if (
        entry.childrenLoaded ||
        directoryLoadsRef.current[treePath]?.state === "loading"
      )
        return
      setDirectoryLoads((current) => ({
        ...current,
        [treePath]: { state: "loading" },
      }))
      void onLoadDirectoryRef
        .current(entry.relativePath)
        .then(() => {
          setDirectoryLoads((current) => {
            const next = { ...current }
            delete next[treePath]
            return next
          })
        })
        .catch((cause) => {
          const item = model.getItem(treePath)
          if (item && "collapse" in item) item.collapse()
          setDirectoryLoads((current) => ({
            ...current,
            [treePath]: {
              state: "error",
              message: cause instanceof Error ? cause.message : String(cause),
            },
          }))
        })
    } else {
      onOpenRef.current(entry)
    }
  }

  const clearExternalDropTarget = () => {
    externalDropRowRef.current?.removeAttribute("data-external-drop-target")
    externalDropRowRef.current = null
    setExternalDropActive(false)
    setExternalDropDirectory(null)
  }

  return (
    <div className="space-file-tree-shell">
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
        style={
          externalDropActive
            ? {
                ...SPACE_FILE_TREE_STYLES,
                outline: "1px solid var(--focus)",
                outlineOffset: "-1px",
              }
            : SPACE_FILE_TREE_STYLES
        }
        onDragOverCapture={(event) => {
          if (
            hasSpacePathDragData(event.dataTransfer) ||
            !Array.from(event.dataTransfer.types).includes("Files")
          )
            return
          event.preventDefault()
          event.stopPropagation()
          const allowed =
            !disabled && !mutationInFlightRef.current && Boolean(onImportFiles)
          const treePath = eventTreePath(event)
          const targetDirectory = externalDropTargetDirectory(treePath)
          const targetTreePath = treePath?.endsWith("/")
            ? treePath
            : treePath
              ? parentTreeDirectory(treePath)
              : null
          const row = targetTreePath
            ? [
                ...(event.currentTarget.shadowRoot?.querySelectorAll<HTMLElement>(
                  "[data-item-path]"
                ) ?? []),
                ...event.currentTarget.querySelectorAll<HTMLElement>(
                  "[data-item-path]"
                ),
              ].find(
                (item) =>
                  item.dataset.itemPath === targetTreePath &&
                  item.dataset.itemParked !== "true"
              )
            : null
          if (externalDropRowRef.current !== row) {
            externalDropRowRef.current?.removeAttribute(
              "data-external-drop-target"
            )
            externalDropRowRef.current = allowed && row ? row : null
            externalDropRowRef.current?.setAttribute(
              "data-external-drop-target",
              "true"
            )
          }
          setExternalDropActive(allowed)
          setExternalDropDirectory(targetDirectory)
          event.dataTransfer.dropEffect =
            disabled || mutationInFlightRef.current || !onImportFiles
              ? "none"
              : "copy"
        }}
        onDragLeaveCapture={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          )
            clearExternalDropTarget()
        }}
        onDropCapture={(event) => {
          if (
            hasSpacePathDragData(event.dataTransfer) ||
            !Array.from(event.dataTransfer.types).includes("Files")
          )
            return
          event.preventDefault()
          event.stopPropagation()
          clearExternalDropTarget()
          if (disabled || mutationInFlightRef.current || !onImportFiles) return
          const files = Array.from(event.dataTransfer.files)
          if (!files.length) return
          const treePath = eventTreePath(event)
          const targetDirectory = externalDropTargetDirectory(treePath)
          mutationInFlightRef.current = true
          void onImportFiles(files, targetDirectory)
            .catch(onMoveError)
            .finally(() => {
              mutationInFlightRef.current = false
            })
        }}
        onDragStart={(event) => {
          const treePath = eventTreePath(event)
          if (!treePath || disabled) return
          const entry = treeRef.current.entryByTreePath.get(treePath)
          if (!entry) return
          setSpacePathDragData(event.dataTransfer, entry.relativePath)
        }}
        onClick={(event) => {
          if (isTreeMultiSelectClick(event)) return
          openTreePath(eventTreePath(event))
        }}
        onContextMenu={(event) => {
          const treePath = eventTreePath(event)
          if (!treePath || disabled) return
          const entry = treeRef.current.entryByTreePath.get(treePath)
          if (!entry) return
          event.preventDefault()
          const selectedPaths = model.getSelectedPaths()
          const clickedWithinSelection = selectedPaths.includes(treePath)
          if (!clickedWithinSelection) {
            for (const selectedPath of selectedPaths) {
              model.getItem(selectedPath)?.deselect()
            }
            model.getItem(treePath)?.select()
          }
          let selectedEntries = clickedWithinSelection
            ? topLevelSelectedEntries(
                selectedPaths.flatMap((path) => {
                  const selected = treeRef.current.entryByTreePath.get(path)
                  return selected ? [selected] : []
                })
              )
            : [entry]
          if (selectedPaths.length > 1 && selectedEntries.length === 1) {
            for (const selectedPath of selectedPaths) {
              model.getItem(selectedPath)?.deselect()
            }
            model.getItem(treePath)?.select()
            selectedEntries = [entry]
          }
          onSelectRef.current(selectedEntries.length === 1 ? entry : null)
          onContextMenuRef.current(
            entry,
            event.clientX,
            event.clientY,
            selectedEntries
          )
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          if (eventTargetsRenameInput(event)) return
          openTreePath(eventTreePath(event) ?? model.getFocusedPath())
        }}
      />
      {externalDropActive ? (
        <div className="space-external-drop-hint" role="status">
          {externalDropDirectory
            ? t("Import into {name}", { name: externalDropDirectory })
            : t("Import into Space root")}
        </div>
      ) : null}
      <span className="space-file-tree-announcement" role="status">
        {Object.entries(directoryLoads)
          .filter(
            ([path]) =>
              tree.entryByTreePath.get(path)?.kind === "directory" &&
              !tree.entryByTreePath.get(path)?.childrenLoaded
          )
          .map(([path, status]) =>
            status.state === "loading"
              ? t("Loading {name}…", {
                  name: relativePathFromTreePath(path),
                })
              : t("Could not load {name}. Click the folder to retry.", {
                  name: relativePathFromTreePath(path),
                })
          )
          .join(" ")}
      </span>
    </div>
  )
}
