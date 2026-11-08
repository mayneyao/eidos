import {
  useCallback,
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
import type { TreeExpansionActions } from "./tree-expansion-menu"
import { EIDOS_FILE_TREE_ICONS } from "./file-tree-icons"
import {
  EXPLORER_ROW_HEIGHT,
  EXPLORER_TREE_CSS,
  SPACE_FILE_TREE_STYLES,
} from "./explorer-presentation"
export { SPACE_FILE_TREE_STYLES } from "./explorer-presentation"
import { hasSpacePathDragData, setSpacePathDragData } from "./space-path-drag"
import { useEidosLiteI18n } from "./i18n"
import {
  compareExplorerEntries,
  DEFAULT_EXPLORER_SORT,
  type ExplorerSort,
} from "./explorer-sort"
import {
  matchesExplorerFileFilter,
  hasExplorerPropertyFilter,
  countExplorerFilterRules,
  explorerFilterSignature,
  filterExplorerEntries,
  ALL_EXPLORER_FILES,
  type ExplorerFileFilter,
} from "./explorer-file-filter"

interface SpaceFileTreeProps {
  entries: SpaceTreeEntry[]
  rootDirectory?: string | null
  sort?: ExplorerSort
  fileFilter?: ExplorerFileFilter
  filtering?: boolean
  filterError?: string
  onRetryFilter?(): void
  activePath: string | null
  revealToken?: number
  disabled?: boolean
  opening?: boolean
  visible?: boolean
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
    selectedEntries: SpaceTreeEntry[],
    expansionActions?: TreeExpansionActions
  ): void
  onExpansionActionsChange?(actions: TreeExpansionActions | null): void
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

function toTreePath(
  entry: SpaceTreeEntry,
  rootDirectory?: string | null
): string {
  const path = rootDirectory
    ? entry.relativePath.slice(rootDirectory.length + 1)
    : entry.relativePath
  return entry.kind === "directory" ? `${path.replace(/\/$/, "")}/` : path
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

export function eventTreePath(
  event: SyntheticEvent<HTMLElement>
): string | null {
  for (const target of event.nativeEvent.composedPath()) {
    if (!(target instanceof HTMLElement)) continue
    const path = target.dataset.itemPath
    if (path) return path
  }
  return null
}

export function eventTargetsRenameInput(
  event: SyntheticEvent<HTMLElement>
): boolean {
  return event.nativeEvent
    .composedPath()
    .some(
      (target) =>
        target instanceof HTMLElement &&
        target.dataset.itemRenameInput !== undefined
    )
}

export function buildSpaceFileTreeModel(
  entries: SpaceTreeEntry[],
  rootDirectory?: string | null,
  sort: ExplorerSort = DEFAULT_EXPLORER_SORT,
  fileFilter: ExplorerFileFilter = ALL_EXPLORER_FILES
): SpaceFileTreeModel {
  // Property predicates are evaluated by the host Runtime. These entries are
  // already filtered; the renderer has no property values to evaluate again.
  const localFilter = hasExplorerPropertyFilter(fileFilter)
    ? ALL_EXPLORER_FILES
    : fileFilter
  const paths: string[] = []
  const initialExpandedPaths: string[] = []
  const entryByTreePath = new Map<string, SpaceTreeEntry>()

  const visit = (entry: SpaceTreeEntry, depth: number) => {
    const treePath = toTreePath(entry, rootDirectory)
    paths.push(treePath)
    entryByTreePath.set(treePath, entry)
    if (
      entry.kind === "directory" &&
      depth === 0 &&
      entry.childrenLoaded !== false
    ) {
      initialExpandedPaths.push(treePath)
    }
    entry.children
      ?.slice()
      .sort((a, b) => compareExplorerEntries(a, b, sort))
      .forEach((child) => visit(child, depth + 1))
  }

  filterExplorerEntries(entries, localFilter)
    .slice()
    .sort((a, b) => compareExplorerEntries(a, b, sort))
    .forEach((entry) => visit(entry, 0))
  return { paths, initialExpandedPaths, entryByTreePath }
}

export function SpaceFileTree({
  entries,
  rootDirectory = null,
  sort = DEFAULT_EXPLORER_SORT,
  fileFilter = ALL_EXPLORER_FILES,
  filtering = false,
  filterError,
  onRetryFilter,
  activePath,
  revealToken = 0,
  disabled: disabledProp,
  opening = false,
  visible = true,
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
  onExpansionActionsChange,
}: SpaceFileTreeProps) {
  const disabled = disabledProp || opening
  const { t } = useEidosLiteI18n()
  const [treeResetVersion, setTreeResetVersion] = useState(0)
  const [externalDropActive, setExternalDropActive] = useState(false)
  const [rootDropActive, setRootDropActive] = useState(false)
  const draggedPathsRef = useRef<string[]>([])
  const [externalDropDirectory, setExternalDropDirectory] = useState<
    string | null
  >(null)

  useEffect(() => {
    const handleDragEnd = () => {
      setExternalDropActive(false)
      setRootDropActive(false)
      draggedPathsRef.current = []
    }
    window.addEventListener("dragend", handleDragEnd)
    return () => window.removeEventListener("dragend", handleDragEnd)
  }, [])
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
  const tree = useMemo(
    () => buildSpaceFileTreeModel(entries, rootDirectory, sort, fileFilter),
    [entries, rootDirectory, sort, fileFilter]
  )
  const spaceDirectory = (path: string | null): string | null =>
    rootDirectory ? (path ? `${rootDirectory}/${path}` : rootDirectory) : path
  const spaceTreePath = (path: string): string =>
    rootDirectory ? `${rootDirectory}/${path}` : path
  const visiblePath =
    activePath && rootDirectory
      ? activePath.startsWith(`${rootDirectory}/`)
        ? activePath.slice(rootDirectory.length + 1)
        : null
      : activePath
  const treeSignature = tree.paths.join("\u0000")
  const fileFilterSignature = explorerFilterSignature(fileFilter)
  const sortSignature = `${sort.by}:${sort.direction}`
  const sortRef = useRef(sort)
  sortRef.current = sort
  const appliedSortSignatureRef = useRef<string | null>(null)
  const appliedOrderRef = useRef<string | null>(null)
  const treeRef = useRef(tree)
  treeRef.current = tree
  const appliedPathsSignatureRef = useRef<string | null>(null)
  const treeInitializedRef = useRef(false)
  const renderedPathsRef = useRef<string[]>([])
  const folderExpansionRef = useRef(new Map<string, boolean>())
  const bulkExpansionRef = useRef<string[] | null>(null)
  const [expansionVersion, setExpansionVersion] = useState(0)
  useEffect(() => {
    bulkExpansionRef.current = null
  }, [fileFilterSignature, rootDirectory])
  const restoreSelectionRef = useRef<readonly string[] | null>(null)
  const rootDropTarget: FileTreeDropTarget = {
    kind: "root",
    directoryPath: null,
    hoveredPath: null,
    flattenedSegmentPath: null,
  }

  const persistMove = (
    draggedPaths: readonly string[],
    target: FileTreeDropTarget
  ) => {
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
        draggedPaths.map((path) =>
          spaceTreePath(relativePathFromTreePath(path))
        ),
        spaceDirectory(dropTargetDirectory(target))
      )
      .catch((cause) => {
        restoreSelectionRef.current = draggedPaths
        appliedPathsSignatureRef.current = null
        setTreeResetVersion((current) => current + 1)
        onMoveErrorRef.current(cause)
      })
      .finally(() => {
        mutationInFlightRef.current = false
      })
  }

  const { model } = useFileTree({
    paths: [],
    sort: (left, right) =>
      compareExplorerEntries(
        treeRef.current.entryByTreePath.get(left.path) ?? {
          name: left.basename,
          relativePath: left.path,
          kind: left.isDirectory ? "directory" : "file",
          modifiedAtMs: 0,
        },
        treeRef.current.entryByTreePath.get(right.path) ?? {
          name: right.basename,
          relativePath: right.path,
          kind: right.isDirectory ? "directory" : "file",
          modifiedAtMs: 0,
        },
        sortRef.current
      ),
    density: 1,
    itemHeight: EXPLORER_ROW_HEIGHT,
    initialExpansion: "closed",
    flattenEmptyDirectories: false,
    icons: EIDOS_FILE_TREE_ICONS,
    stickyFolders: true,
    unsafeCSS: EXPLORER_TREE_CSS,
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
      onDropComplete: ({ draggedPaths, target }) =>
        persistMove(draggedPaths, target),
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
      const keptPaths = new Set(
        topLevelEntries.map((entry) => toTreePath(entry, rootDirectory))
      )
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
    fileFilterSignature,
    revealed: false,
  })

  useEffect(() => {
    const signature = sortedPathsSignature(tree.paths)
    if (
      appliedPathsSignatureRef.current === signature &&
      appliedSortSignatureRef.current === sortSignature &&
      appliedOrderRef.current === treeSignature
    )
      return
    for (const path of renderedPathsRef.current) {
      const item = model.getItem(path)
      if (item && "isExpanded" in item)
        folderExpansionRef.current.set(path, item.isExpanded())
    }
    const expanded = (path: string) => {
      const item = model.getItem(path)
      return item && "isExpanded" in item
        ? item.isExpanded()
        : folderExpansionRef.current.get(path)
    }
    const expandedPaths = treeInitializedRef.current
      ? tree.paths.filter(
          (path) => path.endsWith("/") && expanded(path) === true
        )
      : tree.initialExpandedPaths
    const collapsedPaths = treeInitializedRef.current
      ? tree.paths.filter((path) => {
          return path.endsWith("/") && expanded(path) === false
        })
      : []
    model.resetPaths(tree.paths, {
      initialExpandedPaths: expandedPaths,
    })
    // Pierre's initialExpandedPaths lookup assumes name-ascending siblings,
    // even when a custom sort is configured. Restore by canonical path so
    // lazy hydration cannot discard expansion under date or descending sorts.
    for (const path of expandedPaths) {
      const item = model.getItem(path)
      if (item && "expand" in item && !item.isExpanded()) item.expand()
    }
    // Restoring expanded descendants also expands their ancestors in Pierre.
    // Restore collapsed parents afterwards without losing child expansion state.
    for (const path of collapsedPaths) {
      const item = model.getItem(path)
      if (item && "collapse" in item) item.collapse()
    }
    if (restoreSelectionRef.current) {
      for (const path of restoreSelectionRef.current)
        model.getItem(path)?.select()
      restoreSelectionRef.current = null
    }
    treeInitializedRef.current = true
    renderedPathsRef.current = tree.paths
    appliedPathsSignatureRef.current = signature
    appliedSortSignatureRef.current = sortSignature
    appliedOrderRef.current = treeSignature
  }, [model, treeResetVersion, treeSignature, sortSignature])

  useEffect(() => {
    if (!renameRequest) return
    const path = rootDirectory
      ? renameRequest.treePath.startsWith(`${rootDirectory}/`)
        ? renameRequest.treePath.slice(rootDirectory.length + 1)
        : null
      : renameRequest.treePath
    if (path) model.startRenaming(path)
  }, [model, renameRequest, rootDirectory])

  useEffect(() => {
    if (!visible) return
    if (
      activeRevealRef.current.model !== model ||
      activeRevealRef.current.path !== activePath ||
      activeRevealRef.current.revealToken !== revealToken ||
      activeRevealRef.current.fileFilterSignature !== fileFilterSignature
    ) {
      activeRevealRef.current = {
        model,
        path: activePath,
        revealToken,
        fileFilterSignature,
        revealed: false,
      }
    }
    // Directory hydration also changes treeSignature. Reveal once per document
    // navigation, so browsing folders cannot pull the viewport back to the editor.
    if (activeRevealRef.current.revealed) return
    if (!visiblePath) return
    const activeTreePath = visiblePath
    if (
      hasExplorerPropertyFilter(fileFilter)
        ? !tree.entryByTreePath.has(activeTreePath)
        : !matchesExplorerFileFilter(
            activeTreePath,
            fileFilter,
            activePath ?? activeTreePath
          )
    )
      return
    for (const parentPath of parentTreePaths(activeTreePath)) {
      const parent = model.getItem(parentPath)
      if (parent && "expand" in parent && !parent.isExpanded()) parent.expand()
    }
    const item = model.getItem(activeTreePath)
    if (!item) return
    for (const selectedPath of model.getSelectedPaths()) {
      if (selectedPath !== activeTreePath)
        model.getItem(selectedPath)?.deselect()
    }
    if (!item.isSelected()) item.select()
    model.scrollToPath(activeTreePath, { offset: "nearest", focus: false })
    activeRevealRef.current.revealed = true
  }, [
    visible,
    activePath,
    model,
    treeSignature,
    revealToken,
    fileFilterSignature,
  ])

  const requestDirectoryLoad = useCallback(
    (treePath: string, relativePath: string) => {
      if (directoryLoadsRef.current[treePath]?.state === "loading") return
      directoryLoadsRef.current = {
        ...directoryLoadsRef.current,
        [treePath]: { state: "loading" },
      }
      setDirectoryLoads(directoryLoadsRef.current)
      void onLoadDirectoryRef
        .current(relativePath)
        .then(() => {
          const next = { ...directoryLoadsRef.current }
          delete next[treePath]
          directoryLoadsRef.current = next
          setDirectoryLoads(next)
        })
        .catch((cause) => {
          const item = model.getItem(treePath)
          if (item && "collapse" in item) item.collapse()
          directoryLoadsRef.current = {
            ...directoryLoadsRef.current,
            [treePath]: {
              state: "error",
              message: cause instanceof Error ? cause.message : String(cause),
            },
          }
          setDirectoryLoads(directoryLoadsRef.current)
        })
    },
    [model]
  )

  useEffect(() => {
    if (!visible || disabled) return
    const roots = bulkExpansionRef.current
    if (roots) {
      for (const path of tree.paths) {
        if (!path.endsWith("/") || !roots.some((root) => path.startsWith(root)))
          continue
        if (directoryLoadsRef.current[path]?.state === "error") continue
        const item = model.getItem(path)
        if (item && "expand" in item && !item.isExpanded()) item.expand()
      }
    }
    for (const [treePath, entry] of tree.entryByTreePath) {
      if (
        Object.values(directoryLoadsRef.current).filter(
          (load) => load.state === "loading"
        ).length >= 4
      )
        break
      if (
        entry.kind !== "directory" ||
        entry.childrenLoaded !== false ||
        directoryLoadsRef.current[treePath]
      )
        continue
      const item = model.getItem(treePath)
      if (item && "isExpanded" in item && item.isExpanded())
        requestDirectoryLoad(treePath, entry.relativePath)
    }
    // The intent only spans this hydration operation. Later filesystem refreshes
    // should retain the user's expansion state rather than unfold new folders.
    if (
      roots &&
      ![...tree.entryByTreePath].some(
        ([path, entry]) =>
          entry.kind === "directory" &&
          entry.childrenLoaded === false &&
          roots.some((root) => path.startsWith(root)) &&
          directoryLoadsRef.current[path]?.state !== "error"
      )
    ) {
      bulkExpansionRef.current = null
    }
  }, [
    directoryLoads,
    disabled,
    visible,
    model,
    requestDirectoryLoad,
    tree,
    expansionVersion,
  ])

  const openTreePath = (treePath: string | null) => {
    if (!treePath || disabled) return
    const entry = treeRef.current.entryByTreePath.get(treePath)
    if (!entry) return
    onSelectRef.current(entry)
    if (entry.kind === "directory") {
      const item = model.getItem(treePath)
      if (item && "isExpanded" in item && !item.isExpanded())
        bulkExpansionRef.current = null
      if (!entry.childrenLoaded)
        requestDirectoryLoad(treePath, entry.relativePath)
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

  const setFolderExpansion = useCallback(
    (roots: string[], expand: boolean) => {
      if (disabledRef.current || mutationInFlightRef.current) return
      bulkExpansionRef.current = expand ? roots : null
      if (!expand) {
        for (const path of folderExpansionRef.current.keys()) {
          if (roots.some((root) => path.startsWith(root)))
            folderExpansionRef.current.set(path, false)
        }
      }
      for (const path of [...treeRef.current.paths].reverse()) {
        if (!roots.some((root) => path.startsWith(root))) continue
        const item = model.getItem(path)
        if (item && "expand" in item) {
          if (expand) item.expand()
          else item.collapse()
          folderExpansionRef.current.set(path, expand)
        }
      }
      setExpansionVersion((value) => value + 1)
    },
    [model]
  )
  const createExpansionActions = useCallback(
    (
      roots: string[],
      scope: TreeExpansionActions["scope"]
    ): TreeExpansionActions => {
      const isExpanded = () => {
        const paths = treeRef.current.paths.filter(
          (path) =>
            path.endsWith("/") && roots.some((root) => path.startsWith(root))
        )
        return (
          paths.length > 0 &&
          paths.every((path) => {
            const item = model.getItem(path)
            return item && "isExpanded" in item && item.isExpanded()
          })
        )
      }
      return {
        scope,
        isExpanded,
        toggle: () => setFolderExpansion(roots, !isExpanded()),
      }
    },
    [model, setFolderExpansion]
  )
  useEffect(() => {
    onExpansionActionsChange?.(createExpansionActions([""], "all"))
    return () => onExpansionActionsChange?.(null)
  }, [onExpansionActionsChange, createExpansionActions])
  const expansionActions = (
    selected: string[]
  ): TreeExpansionActions | undefined => {
    const roots = selected.filter(
      (path) => treeRef.current.entryByTreePath.get(path)?.kind === "directory"
    )
    if (!roots.length) return undefined
    return createExpansionActions(roots, "folder")
  }

  return (
    <div className="space-file-tree-shell">
      {countExplorerFilterRules(fileFilter) > 0 &&
        (filterError || tree.paths.length === 0) && (
          <p
            className="explorer-filter-empty"
            role={filterError ? "alert" : "status"}
          >
            {filterError
              ? t("Could not filter files.")
              : filtering
                ? t("Filtering files…")
                : t("No matching files")}
            {filterError && (
              <button
                type="button"
                className="quiet-button"
                onClick={onRetryFilter}
              >
                {t("Retry")}
              </button>
            )}
          </p>
        )}
      <FileTree
        model={model}
        aria-label="Space files"
        aria-disabled={disabledProp === true}
        className="space-file-tree"
        data-space-file-tree="true"
        data-active-path={activePath ?? undefined}
        data-active-selected={
          visiblePath && selectedPaths.includes(visiblePath) ? "true" : "false"
        }
        style={
          externalDropActive
            ? {
                ...SPACE_FILE_TREE_STYLES,
                outline: "1px dashed var(--focus)",
                outlineOffset: "-1px",
              }
            : SPACE_FILE_TREE_STYLES
        }
        onDragOverCapture={(event) => {
          const isInternal = hasSpacePathDragData(event.dataTransfer)
          const isExternal = Array.from(event.dataTransfer.types).includes(
            "Files"
          )
          if (!isInternal && !isExternal) return

          const treePath = eventTreePath(event)

          if (isInternal) {
            const allowed =
              !treePath &&
              !disabled &&
              !mutationInFlightRef.current &&
              canMoveTreeDrop({
                draggedPaths: draggedPathsRef.current,
                target: rootDropTarget,
              })
            setRootDropActive(allowed)
            if (!treePath) {
              event.preventDefault()
              event.stopPropagation()
              event.dataTransfer.dropEffect = allowed ? "move" : "none"
            }
            return
          }

          if (isExternal) {
            event.preventDefault()
            event.stopPropagation()
            const allowed =
              !disabled &&
              !mutationInFlightRef.current &&
              Boolean(onImportFiles)
            const targetDirectory = spaceDirectory(
              externalDropTargetDirectory(treePath)
            )
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
          }
        }}
        onDragLeaveCapture={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          ) {
            clearExternalDropTarget()
            setRootDropActive(false)
          }
        }}
        onDropCapture={(event) => {
          const isInternal = hasSpacePathDragData(event.dataTransfer)
          const isExternal = Array.from(event.dataTransfer.types).includes(
            "Files"
          )
          if (!isInternal && !isExternal) return

          const treePath = eventTreePath(event)

          if (isInternal) {
            setRootDropActive(false)
            if (treePath) return
            event.preventDefault()
            event.stopPropagation()
            const draggedPaths = draggedPathsRef.current
            if (
              disabled ||
              mutationInFlightRef.current ||
              !canMoveTreeDrop({ draggedPaths, target: rootDropTarget })
            )
              return
            try {
              model.batch(
                draggedPaths.map((from) => ({
                  type: "move" as const,
                  from,
                  to: droppedTreePath(from, rootDropTarget),
                }))
              )
              persistMove(draggedPaths, rootDropTarget)
            } catch (cause) {
              restoreSelectionRef.current = draggedPaths
              appliedPathsSignatureRef.current = null
              setTreeResetVersion((current) => current + 1)
              onMoveErrorRef.current(cause)
            }
            return
          }

          if (isExternal) {
            event.preventDefault()
            event.stopPropagation()
            clearExternalDropTarget()
            if (disabled || mutationInFlightRef.current || !onImportFiles)
              return
            const files = Array.from(event.dataTransfer.files)
            if (!files.length) return
            const targetDirectory = spaceDirectory(
              externalDropTargetDirectory(treePath)
            )
            mutationInFlightRef.current = true
            void onImportFiles(files, targetDirectory)
              .catch(onMoveError)
              .finally(() => {
                mutationInFlightRef.current = false
              })
          }
        }}
        onDragStart={(event) => {
          const treePath = eventTreePath(event)
          if (!treePath || disabled) return
          const entry = treeRef.current.entryByTreePath.get(treePath)
          if (!entry) return
          const selectedPaths = model.getSelectedPaths()
          const draggedTreePaths = selectedPaths.includes(treePath)
            ? selectedPaths
            : [treePath]
          draggedPathsRef.current = topLevelSelectedEntries(
            draggedTreePaths.flatMap((path) => {
              const selected = treeRef.current.entryByTreePath.get(path)
              return selected ? [selected] : []
            })
          ).map((entry) => toTreePath(entry, rootDirectory))
          setSpacePathDragData(
            event.dataTransfer,
            entry.relativePath,
            draggedTreePaths.map((path) =>
              spaceTreePath(relativePathFromTreePath(path))
            )
          )
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
          event.stopPropagation()
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
            selectedEntries,
            expansionActions(
              selectedEntries
                .filter((entry) => entry.kind === "directory")
                .map((entry) =>
                  rootDirectory
                    ? entry.relativePath.slice(rootDirectory.length + 1) + "/"
                    : entry.relativePath + "/"
                )
            )
          )
        }}
        onKeyDownCapture={(event) => {
          if (event.key === "ArrowLeft") bulkExpansionRef.current = null
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          if (eventTargetsRenameInput(event)) return
          openTreePath(eventTreePath(event) ?? model.getFocusedPath())
        }}
      />
      {rootDropActive && (
        <div className="space-external-drop-hint" role="status">
          {rootDirectory
            ? t("Move into {name}", { name: rootDirectory })
            : t("Move to Space root")}
        </div>
      )}
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
