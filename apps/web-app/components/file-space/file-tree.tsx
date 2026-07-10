import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"
import type { SpaceFileEntry } from "@eidos.space/file-space"
import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileImage,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronsDownUp,
  MoreHorizontal,
  PencilLine,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useActiveSpaceVersioningOperation } from "@/apps/web-app/hooks/use-space-versioning"
import {
  useSpaceFileChanges,
  useSpaceFiles,
} from "@/apps/web-app/hooks/use-space-files"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  NativeContextMenu as ContextMenu,
  NativeContextMenuContent as ContextMenuContent,
  NativeContextMenuItem as ContextMenuItem,
  NativeContextMenuSeparator as ContextMenuSeparator,
  NativeContextMenuTrigger as ContextMenuTrigger,
} from "@/components/ui/native-context-menu"

import {
  ancestorSpacePaths,
  canMoveSpaceEntryTo,
  filePathFromSpaceUrl,
  isSameOrDescendant,
  joinSpacePath,
  moveSpaceFileUrl,
  parentSpacePath,
  toSpaceFileUrl,
  uniqueSpaceEntryName,
  validateSpaceEntryName,
} from "./file-path"
import { refreshExpandedDirectoryTree } from "./file-tree-refresh"
import {
  flushCurrentSpaceFile,
  navigateAfterFlushingSpaceFile,
} from "./file-navigation"
import { flushPendingFileWrites } from "./pending-writes"

interface FileSpaceTreeProps {
  spaceId: string
}

interface VisibleTreeItem {
  entry: SpaceFileEntry
  level: number
}

type EntryDraft =
  | {
      type: "create-file"
      parentPath: string
      value: string
    }
  | {
      type: "create-directory"
      parentPath: string
      value: string
    }
  | {
      type: "rename"
      parentPath: string
      value: string
      entry: SpaceFileEntry
    }

const CODE_EXTENSIONS = new Set([
  "css",
  "html",
  "js",
  "json",
  "jsx",
  "py",
  "sh",
  "sql",
  "ts",
  "tsx",
  "xml",
  "yaml",
  "yml",
])
const IMAGE_EXTENSIONS = new Set([
  "avif",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
])

function fileIcon(entry: SpaceFileEntry, expanded: boolean) {
  if (entry.kind === "directory") {
    return expanded ? FolderOpen : Folder
  }
  const extension = entry.name.split(".").pop()?.toLowerCase() ?? ""
  if (extension === "md" || extension === "markdown") return FileText
  if (IMAGE_EXTENSIONS.has(extension)) return FileImage
  if (CODE_EXTENSIONS.has(extension)) return FileCode2
  return File
}

function updateTabsAfterMove(sourcePath: string, destinationPath: string) {
  const { tabs, updateTab } = useTabStore.getState()
  for (const tab of tabs) {
    const nextUrl = moveSpaceFileUrl(tab.url, sourcePath, destinationPath)
    if (nextUrl) updateTab(tab.id, { url: nextUrl })
  }
}

function closeTabsForPath(relativePath: string) {
  const { tabs, closeTab } = useTabStore.getState()
  for (const tab of tabs) {
    const tabPath = filePathFromSpaceUrl(tab.url)
    if (tabPath && isSameOrDescendant(tabPath, relativePath)) {
      closeTab(tab.id)
    }
  }
}

export function FileSpaceTree({ spaceId }: FileSpaceTreeProps) {
  const {
    createDirectory,
    createText,
    importFiles,
    list,
    move,
    remove,
    reveal,
  } = useSpaceFiles(spaceId)
  const versioningOperation = useActiveSpaceVersioningOperation(spaceId)
  const restoringVersion = versioningOperation === "restoring"
  const { location, navigate } = useRouterAdapter()
  const setGlobalSearchOpen = useAppRuntimeStore(
    (state) => state.setGlobalSearchOpen
  )
  const [entriesByDirectory, setEntriesByDirectory] = useState<
    Map<string, SpaceFileEntry[]>
  >(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [readError, setReadError] = useState<string | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [filesExpanded, setFilesExpanded] = useState(true)
  const [draft, setDraft] = useState<EntryDraft | null>(null)
  const [submittingDraft, setSubmittingDraft] = useState(false)
  const [draggedEntry, setDraggedEntry] = useState<SpaceFileEntry | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  const treeItemRefs = useRef(new Map<string, HTMLDivElement>())

  const blockMutationDuringRestore = useCallback(() => {
    if (!restoringVersion) return false
    setOperationError(
      "Wait for the Space restore to finish before changing files."
    )
    return true
  }, [restoringVersion])

  const selectedPath = useMemo(() => {
    if (!location.pathname.endsWith("/space-file")) return null
    return filePathFromSpaceUrl(
      location.pathname + location.search + location.hash
    )
  }, [location.hash, location.pathname, location.search])

  const loadDirectory = useCallback(
    async (directory: string): Promise<SpaceFileEntry[]> => {
      setLoading((current) => new Set(current).add(directory))
      try {
        const entries = await list(directory)
        setEntriesByDirectory((current) => {
          const next = new Map(current)
          next.set(directory, entries)
          return next
        })
        if (!directory) setReadError(null)
        return entries
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Unable to read this Space"
        if (directory) setOperationError(message)
        else setReadError(message)
        return []
      } finally {
        setLoading((current) => {
          const next = new Set(current)
          next.delete(directory)
          return next
        })
      }
    },
    [list]
  )

  useEffect(() => {
    void loadDirectory("")
  }, [loadDirectory])

  useEffect(() => {
    if (!selectedPath) return
    const ancestors = ancestorSpacePaths(selectedPath)
    if (ancestors.length === 0) return
    setExpanded((current) => new Set([...current, ...ancestors]))
    for (const directory of ancestors) void loadDirectory(directory)
  }, [loadDirectory, selectedPath])

  useSpaceFileChanges(
    spaceId,
    useCallback(
      (event) => {
        if (event.eventType !== "rescan") {
          void loadDirectory(parentSpacePath(event.path))
          return
        }
        setEntriesByDirectory((current) => {
          const next = new Map(current)
          for (const directory of next.keys()) {
            if (directory && isSameOrDescendant(directory, event.path)) {
              next.delete(directory)
            }
          }
          return next
        })
        void refreshExpandedDirectoryTree(event.path, expanded, loadDirectory)
      },
      [expanded, loadDirectory]
    )
  )

  const toggleDirectory = useCallback(
    (entry: SpaceFileEntry) => {
      setExpanded((current) => {
        const next = new Set(current)
        if (next.has(entry.path)) {
          next.delete(entry.path)
        } else {
          next.add(entry.path)
          if (!entriesByDirectory.has(entry.path)) {
            void loadDirectory(entry.path)
          }
        }
        return next
      })
    },
    [entriesByDirectory, loadDirectory]
  )

  const startCreate = useCallback(
    async (parentPath: string, type: "create-file" | "create-directory") => {
      if (blockMutationDuringRestore()) return
      setOperationError(null)
      setFilesExpanded(true)
      if (parentPath) {
        setExpanded((current) => new Set(current).add(parentPath))
      }
      const entries = entriesByDirectory.has(parentPath)
        ? (entriesByDirectory.get(parentPath) ?? [])
        : await loadDirectory(parentPath)
      setDraft({
        type,
        parentPath,
        value:
          type === "create-file"
            ? uniqueSpaceEntryName(
                entries.map((entry) => entry.name),
                "Untitled",
                ".md"
              )
            : uniqueSpaceEntryName(
                entries.map((entry) => entry.name),
                "New folder"
              ),
      })
    },
    [blockMutationDuringRestore, entriesByDirectory, loadDirectory]
  )

  const startRename = useCallback(
    (entry: SpaceFileEntry) => {
      if (blockMutationDuringRestore()) return
      setOperationError(null)
      setDraft({
        type: "rename",
        parentPath: entry.parentPath,
        value: entry.name,
        entry,
      })
    },
    [blockMutationDuringRestore]
  )

  const importInto = useCallback(
    async (directory: string) => {
      if (blockMutationDuringRestore()) return
      setOperationError(null)
      try {
        const result = await importFiles(directory)
        if (result.canceled) return
        if (result.imported.length > 0) {
          setFilesExpanded(true)
          if (directory) {
            setExpanded((current) => new Set(current).add(directory))
          }
          await loadDirectory(directory)
        }
        if (result.errors.length > 0) {
          const first = result.errors[0]
          setOperationError(
            result.errors.length === 1
              ? first.message
              : `${result.errors.length} files could not be imported. ${first.message}`
          )
        }
      } catch (importError) {
        setOperationError(
          importError instanceof Error
            ? importError.message
            : "Unable to import files"
        )
      }
    },
    [blockMutationDuringRestore, importFiles, loadDirectory]
  )

  const performMove = useCallback(
    async (entry: SpaceFileEntry, destinationPath: string) => {
      if (blockMutationDuringRestore()) {
        throw new Error("The Space is being restored")
      }
      if (destinationPath === entry.path) return
      const destinationParent = parentSpacePath(destinationPath)
      const shouldRestoreExpansion =
        entry.kind === "directory" && expanded.has(entry.path)

      if (
        !(await flushPendingFileWrites({
          spaceId,
          path: entry.path,
        }))
      ) {
        throw new Error(
          "Eidos could not save this item before moving it. Resolve the file error and try again."
        )
      }
      await move(entry.path, destinationPath)
      updateTabsAfterMove(entry.path, destinationPath)
      setEntriesByDirectory((current) => {
        const next = new Map(current)
        for (const directory of next.keys()) {
          if (isSameOrDescendant(directory, entry.path)) {
            next.delete(directory)
          }
        }
        return next
      })
      setExpanded((current) => {
        const next = new Set(current)
        for (const directory of next) {
          if (isSameOrDescendant(directory, entry.path)) {
            next.delete(directory)
          }
        }
        if (shouldRestoreExpansion) next.add(destinationPath)
        return next
      })

      await Promise.all(
        [...new Set([entry.parentPath, destinationParent])].map((directory) =>
          loadDirectory(directory)
        )
      )
      if (shouldRestoreExpansion) await loadDirectory(destinationPath)
    },
    [blockMutationDuringRestore, expanded, loadDirectory, move, spaceId]
  )

  const canDropInto = useCallback(
    (directory: string) => {
      if (restoringVersion || !draggedEntry) return false
      return canMoveSpaceEntryTo(
        draggedEntry.path,
        draggedEntry.parentPath,
        draggedEntry.kind === "directory",
        directory
      )
    },
    [draggedEntry, restoringVersion]
  )

  const dropInto = useCallback(
    async (directory: string) => {
      const entry = draggedEntry
      setDropTarget(null)
      setDraggedEntry(null)
      if (!entry || !canDropInto(directory)) return

      setOperationError(null)
      const destinationPath = joinSpacePath(directory, entry.name)
      try {
        await performMove(entry, destinationPath)
        if (directory) {
          setExpanded((current) => new Set(current).add(directory))
        }
      } catch (operationFailure) {
        setOperationError(
          operationFailure instanceof Error
            ? operationFailure.message
            : "Unable to move this item"
        )
      }
    },
    [canDropInto, draggedEntry, performMove]
  )

  const commitDraft = useCallback(async () => {
    if (blockMutationDuringRestore()) return
    if (!draft || submittingDraft) return
    const currentDraft = draft
    const name = currentDraft.value.trim()
    const validationError = validateSpaceEntryName(name)
    if (validationError) {
      setOperationError(validationError)
      return
    }

    setSubmittingDraft(true)
    setOperationError(null)
    try {
      const destinationPath = joinSpacePath(currentDraft.parentPath, name)
      if (currentDraft.type === "create-file") {
        if (!(await flushCurrentSpaceFile(spaceId, selectedPath))) {
          throw new Error(
            "Eidos could not save the current file. Resolve the error before opening another file."
          )
        }
        await createText(destinationPath)
        setDraft(null)
        await loadDirectory(currentDraft.parentPath)
        navigate(toSpaceFileUrl(destinationPath))
      } else if (currentDraft.type === "create-directory") {
        await createDirectory(destinationPath)
        setDraft(null)
        await loadDirectory(currentDraft.parentPath)
      } else {
        if (destinationPath === currentDraft.entry.path) {
          setDraft(null)
          return
        }
        await performMove(currentDraft.entry, destinationPath)
        setDraft(null)
      }
    } catch (operationFailure) {
      setOperationError(
        operationFailure instanceof Error
          ? operationFailure.message
          : "Unable to update this Space"
      )
    } finally {
      setSubmittingDraft(false)
    }
  }, [
    createDirectory,
    createText,
    blockMutationDuringRestore,
    draft,
    loadDirectory,
    navigate,
    performMove,
    selectedPath,
    spaceId,
    submittingDraft,
  ])

  const deleteEntry = useCallback(
    async (entry: SpaceFileEntry) => {
      if (blockMutationDuringRestore()) return
      const message =
        entry.kind === "directory"
          ? `Delete “${entry.name}” and everything inside it? This cannot be undone.`
          : `Delete “${entry.name}”? This cannot be undone.`
      if (!window.confirm(message)) return

      setOperationError(null)
      try {
        if (
          !(await flushPendingFileWrites({
            spaceId,
            path: entry.path,
          }))
        ) {
          throw new Error(
            "Eidos could not finish saving this item before deleting it. Resolve the file error and try again."
          )
        }
        await remove(entry.path)
        closeTabsForPath(entry.path)
        setEntriesByDirectory((current) => {
          const next = new Map(current)
          for (const directory of next.keys()) {
            if (isSameOrDescendant(directory, entry.path)) {
              next.delete(directory)
            }
          }
          return next
        })
        await loadDirectory(entry.parentPath)
      } catch (operationFailure) {
        setOperationError(
          operationFailure instanceof Error
            ? operationFailure.message
            : "Unable to delete this item"
        )
      }
    },
    [blockMutationDuringRestore, loadDirectory, remove, spaceId]
  )

  const openFile = useCallback(
    async (entry: SpaceFileEntry) => {
      const navigated = await navigateAfterFlushingSpaceFile({
        spaceId,
        currentFilePath: selectedPath,
        destination: toSpaceFileUrl(entry.path),
        navigate,
      })
      if (!navigated) {
        setOperationError(
          "Eidos could not save the current file. Resolve the error before opening another file."
        )
      }
    },
    [navigate, selectedPath, spaceId]
  )

  const visibleTreeItems = useMemo(() => {
    const items: VisibleTreeItem[] = []
    const visit = (directory: string, level: number) => {
      for (const entry of entriesByDirectory.get(directory) ?? []) {
        items.push({ entry, level })
        if (entry.kind === "directory" && expanded.has(entry.path)) {
          visit(entry.path, level + 1)
        }
      }
    }
    visit("", 0)
    return items
  }, [entriesByDirectory, expanded])

  const visiblePaths = useMemo(
    () => new Set(visibleTreeItems.map(({ entry }) => entry.path)),
    [visibleTreeItems]
  )
  const rovingPath =
    (focusedPath && visiblePaths.has(focusedPath) ? focusedPath : null) ??
    (selectedPath && visiblePaths.has(selectedPath) ? selectedPath : null) ??
    visibleTreeItems[0]?.entry.path ??
    null

  const focusTreeItem = useCallback((path: string) => {
    setFocusedPath(path)
    treeItemRefs.current.get(path)?.focus()
  }, [])

  const handleTreeItemKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>, entry: SpaceFileEntry) => {
      // Tree items are nested. Let the deepest focused item own the event.
      if (event.target !== event.currentTarget) return

      const index = visibleTreeItems.findIndex(
        ({ entry: visibleEntry }) => visibleEntry.path === entry.path
      )
      if (index < 0) return

      const focusAt = (nextIndex: number) => {
        const nextPath = visibleTreeItems[nextIndex]?.entry.path
        if (nextPath) focusTreeItem(nextPath)
      }
      const isDirectory = entry.kind === "directory"

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault()
          event.stopPropagation()
          focusAt(Math.min(index + 1, visibleTreeItems.length - 1))
          return
        case "ArrowUp":
          event.preventDefault()
          event.stopPropagation()
          focusAt(Math.max(index - 1, 0))
          return
        case "Home":
          event.preventDefault()
          event.stopPropagation()
          focusAt(0)
          return
        case "End":
          event.preventDefault()
          event.stopPropagation()
          focusAt(visibleTreeItems.length - 1)
          return
        case "ArrowRight":
          if (!isDirectory) return
          event.preventDefault()
          event.stopPropagation()
          if (!expanded.has(entry.path)) {
            toggleDirectory(entry)
            return
          }
          if (visibleTreeItems[index + 1]?.entry.parentPath === entry.path) {
            focusAt(index + 1)
          }
          return
        case "ArrowLeft":
          event.preventDefault()
          event.stopPropagation()
          if (isDirectory && expanded.has(entry.path)) {
            toggleDirectory(entry)
            return
          }
          if (entry.parentPath && visiblePaths.has(entry.parentPath)) {
            focusTreeItem(entry.parentPath)
          }
          return
        case "Enter":
        case " ":
          event.preventDefault()
          event.stopPropagation()
          if (isDirectory) toggleDirectory(entry)
          else void openFile(entry)
          return
      }
    },
    [
      expanded,
      focusTreeItem,
      openFile,
      toggleDirectory,
      visiblePaths,
      visibleTreeItems,
    ]
  )

  const renderDraft = (level: number, key: string) => {
    if (!draft) return null
    const isDirectoryDraft =
      draft.type === "create-directory" ||
      (draft.type === "rename" && draft.entry.kind === "directory")
    const DraftIcon = isDirectoryDraft ? Folder : FileText
    return (
      <div
        key={key}
        role="none"
        className="flex h-[22px] min-w-0 items-center gap-1 pr-1"
        style={{ paddingLeft: 24 + level * 12 }}
      >
        <DraftIcon className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
        <Input
          autoFocus
          value={draft.value}
          disabled={submittingDraft}
          aria-label="File name"
          className="h-5 min-w-0 flex-1 rounded-[2px] px-1 text-[13px]"
          onChange={(event) =>
            setDraft((current) =>
              current ? { ...current, value: event.target.value } : current
            )
          }
          onFocus={(event) => {
            const dotIndex = !isDirectoryDraft
              ? event.currentTarget.value.lastIndexOf(".")
              : -1
            event.currentTarget.setSelectionRange(
              0,
              dotIndex > 0 ? dotIndex : event.currentTarget.value.length
            )
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void commitDraft()
            } else if (event.key === "Escape") {
              setDraft(null)
              setOperationError(null)
            }
          }}
        />
      </div>
    )
  }

  const renderDirectory = (directory: string, level: number): ReactNode[] => {
    const entries = entriesByDirectory.get(directory) ?? []
    const rows: ReactNode[] = []

    if (draft?.type !== "rename" && draft?.parentPath === directory) {
      rows.push(renderDraft(level, `draft:${directory}`))
    }

    for (const entry of entries) {
      const isDirectory = entry.kind === "directory"
      const isExpanded = expanded.has(entry.path)
      const Icon = fileIcon(entry, isExpanded)
      const isLoading = loading.has(entry.path)
      const isSelected = selectedPath === entry.path

      if (draft?.type === "rename" && draft.entry.path === entry.path) {
        rows.push(renderDraft(level, `rename:${entry.path}`))
        continue
      }

      rows.push(
        <div
          key={entry.path}
          ref={(node) => {
            if (node) treeItemRefs.current.set(entry.path, node)
            else treeItemRefs.current.delete(entry.path)
          }}
          role="treeitem"
          aria-level={level + 1}
          aria-expanded={isDirectory ? isExpanded : undefined}
          aria-selected={isSelected}
          tabIndex={rovingPath === entry.path ? 0 : -1}
          className="group/treeitem focus:outline-hidden"
          onFocus={(event) => {
            if (event.target === event.currentTarget) {
              setFocusedPath(entry.path)
            }
          }}
          onKeyDown={(event) => handleTreeItemKeyDown(event, entry)}
        >
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                draggable={!draft && !restoringVersion}
                className={cn(
                  "group flex h-[22px] w-full min-w-0 items-center gap-1 pr-2 text-left text-[13px] leading-none transition-colors group-focus-visible/treeitem:ring-1 group-focus-visible/treeitem:ring-inset group-focus-visible/treeitem:ring-sidebar-ring",
                  draggedEntry?.path === entry.path && "opacity-50",
                  dropTarget === entry.path &&
                    "bg-sidebar-accent ring-1 ring-sidebar-ring",
                  isSelected
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                )}
                style={{ paddingLeft: 4 + level * 12 }}
                title={entry.path}
                onMouseDown={(event) => {
                  if (event.button === 0) focusTreeItem(entry.path)
                }}
                onClick={() => {
                  focusTreeItem(entry.path)
                  if (isDirectory) toggleDirectory(entry)
                  else void openFile(entry)
                }}
                onDragStart={(event) => {
                  setDraggedEntry(entry)
                  setDropTarget(null)
                  event.dataTransfer.effectAllowed = "move"
                  event.dataTransfer.setData(
                    "text/x-eidos-space-path",
                    entry.path
                  )
                }}
                onDragEnd={() => {
                  setDraggedEntry(null)
                  setDropTarget(null)
                }}
                onDragOver={(event) => {
                  if (!isDirectory || !canDropInto(entry.path)) return
                  event.preventDefault()
                  event.stopPropagation()
                  event.dataTransfer.dropEffect = "move"
                  setDropTarget(entry.path)
                }}
                onDrop={(event) => {
                  if (!isDirectory || !canDropInto(entry.path)) return
                  event.preventDefault()
                  event.stopPropagation()
                  void dropInto(entry.path)
                }}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/90">
                  {isDirectory ? (
                    isLoading ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )
                  ) : null}
                </span>
                <Icon className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
              {isDirectory ? (
                <>
                  <ContextMenuItem
                    disabled={restoringVersion}
                    onClick={() => void startCreate(entry.path, "create-file")}
                  >
                    <FilePlus2 className="mr-2 h-4 w-4" />
                    New note
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={restoringVersion}
                    onClick={() =>
                      void startCreate(entry.path, "create-directory")
                    }
                  >
                    <FolderPlus className="mr-2 h-4 w-4" />
                    New folder
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={restoringVersion}
                    onClick={() => void importInto(entry.path)}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Import files
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                </>
              ) : null}
              <ContextMenuItem
                disabled={restoringVersion}
                onClick={() => startRename(entry)}
              >
                <PencilLine className="mr-2 h-4 w-4" />
                Rename
              </ContextMenuItem>
              <ContextMenuItem onClick={() => void reveal(entry.path)}>
                <FolderOpen className="mr-2 h-4 w-4" />
                Show in file manager
              </ContextMenuItem>
              <ContextMenuItem
                className="text-destructive focus:text-destructive"
                disabled={restoringVersion}
                onClick={() => void deleteEntry(entry)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          {isDirectory && isExpanded ? (
            <div role="group">{renderDirectory(entry.path, level + 1)}</div>
          ) : null}
        </div>
      )
    }
    return rows
  }

  return (
    <div className="min-h-0">
      <div className="group/explorer flex h-[30px] items-center border-b border-sidebar-border/50 px-1">
        <button
          type="button"
          className={cn(
            "flex h-[22px] min-w-0 flex-1 items-center gap-0.5 rounded-[3px] px-0.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/75 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring",
            dropTarget === "" && "bg-sidebar-accent ring-1 ring-sidebar-ring"
          )}
          aria-expanded={filesExpanded}
          onClick={() => setFilesExpanded((current) => !current)}
          onDragOver={(event) => {
            if (!canDropInto("")) return
            event.preventDefault()
            event.dataTransfer.dropEffect = "move"
            setDropTarget("")
          }}
          onDrop={(event) => {
            if (!canDropInto("")) return
            event.preventDefault()
            void dropInto("")
          }}
        >
          {filesExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )}
          Files
        </button>
        <div className="pointer-events-none ml-auto flex shrink-0 items-center gap-px opacity-0 transition-opacity group-focus-within/explorer:pointer-events-auto group-focus-within/explorer:opacity-100 group-hover/explorer:pointer-events-auto group-hover/explorer:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-[22px] w-[22px] rounded-[3px] text-sidebar-foreground/80"
            title="New note"
            aria-label="New note"
            disabled={restoringVersion}
            onClick={() => void startCreate("", "create-file")}
          >
            <FilePlus2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-[22px] w-[22px] rounded-[3px] text-sidebar-foreground/80"
            title="New folder"
            aria-label="New folder"
            disabled={restoringVersion}
            onClick={() => void startCreate("", "create-directory")}
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-[22px] w-[22px] rounded-[3px] text-sidebar-foreground/80"
            title="Refresh files"
            aria-label="Refresh files"
            onClick={() => void loadDirectory("")}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", loading.has("") && "animate-spin")}
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-[22px] w-[22px] rounded-[3px] text-sidebar-foreground/80"
            title="Collapse folders"
            aria-label="Collapse folders"
            disabled={expanded.size === 0}
            onClick={() => setExpanded(new Set())}
          >
            <ChevronsDownUp className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-[22px] w-[22px] rounded-[3px] text-sidebar-foreground/80 data-[state=open]:bg-sidebar-accent"
                title="More actions"
                aria-label="More file actions"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setGlobalSearchOpen(true)}>
                <Search />
                Search Space
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={restoringVersion}
                onSelect={() => void importInto("")}
              >
                <Upload />
                Import files…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void reveal()}>
                <FolderOpen />
                Show Space in file manager
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {operationError ? (
        <div className="flex items-start gap-1 border-b border-destructive/20 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
          <span className="min-w-0 flex-1 break-words">{operationError}</span>
          <button
            type="button"
            className="mt-0.5 shrink-0"
            aria-label="Dismiss error"
            onClick={() => setOperationError(null)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {!filesExpanded ? null : readError ? (
        <div className="px-2 py-3 text-xs text-destructive">
          <p>{readError}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-7 px-2"
            onClick={() => void loadDirectory("")}
          >
            Try again
          </Button>
        </div>
      ) : !entriesByDirectory.has("") && loading.has("") ? (
        <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Reading files…
        </div>
      ) : (entriesByDirectory.get("")?.length ?? 0) === 0 && !draft ? (
        <div className="px-5 py-3 text-xs leading-relaxed text-muted-foreground">
          <p>This Space has no files yet.</p>
          <button
            type="button"
            className="mt-1 text-sidebar-foreground underline decoration-border underline-offset-2 hover:decoration-sidebar-foreground"
            onClick={() => void startCreate("", "create-file")}
          >
            Create a note
          </button>
        </div>
      ) : (
        <div role="tree" aria-label="Files">
          {renderDirectory("", 0)}
        </div>
      )}
    </div>
  )
}
