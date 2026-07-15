import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CreateBaseOptions } from "@eidos.space/base"
import type { SpaceFileEntry } from "@eidos.space/file-space"
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  ChevronsDownUp,
  MoreHorizontal,
  RefreshCw,
  Search,
  Table2,
  Upload,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useSpaceBase } from "@/apps/web-app/hooks/use-space-base"
import {
  isDestructiveSpaceVersioningOperation,
  useActiveSpaceVersioningOperation,
} from "@/apps/web-app/hooks/use-space-versioning"
import {
  useSpaceFileChanges,
  useSpaceFiles,
} from "@/apps/web-app/hooks/use-space-files"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { useFileSpaceSettings } from "@/apps/web-app/store/file-space-settings"
import {
  useFileExtensionCommands,
  type FileExtensionCommand,
} from "@/apps/web-app/hooks/use-file-extension-commands"
import { useFileExtensionEditors } from "@/apps/web-app/hooks/use-file-extension-editors"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import {
  ancestorSpacePaths,
  canMoveSpaceEntryTo,
  filePathFromSpaceUrl,
  isSameOrDescendant,
  joinSpacePath,
  moveSpaceFileUrl,
  parentSpacePath,
  toSpaceFileEditorUrl,
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
import { SpaceFilesTree, type SpaceFilesTreeHandle } from "./trees-file-tree"
import { BaseCreatePopover } from "./base/base-create-dialog"
import { preloadSpaceBaseEditor } from "./base/space-base-editor-loader"
import { matchesFileExtensionMenuWhen } from "../file-extensions/extension-menu-context"

interface FileSpaceTreeProps {
  spaceId: string
}

const EXTENSION_SOURCE_ROOT = ".eidos/extensions"

function isExtensionSourceTreePath(relativePath: string): boolean {
  return (
    relativePath === ".eidos" ||
    relativePath === EXTENSION_SOURCE_ROOT ||
    relativePath.startsWith(`${EXTENSION_SOURCE_ROOT}/`)
  )
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
  const { create: createBase } = useSpaceBase(spaceId)
  const { commands: extensionCommands, execute: executeExtensionCommand } =
    useFileExtensionCommands(spaceId)
  const { editorsFor: extensionEditorsFor, load: loadExtensionEditors } =
    useFileExtensionEditors(spaceId)
  const versioningOperation = useActiveSpaceVersioningOperation(spaceId)
  const restoringVersion =
    isDestructiveSpaceVersioningOperation(versioningOperation)
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
  const [baseDialogOpen, setBaseDialogOpen] = useState(false)
  const [baseInitialName, setBaseInitialName] = useState("Untitled.base")
  const [baseParentPath, setBaseParentPath] = useState("")
  const treeRef = useRef<SpaceFilesTreeHandle>(null)
  const extensionSourceRevealRef = useRef<"idle" | "loading" | "done">("idle")
  const viewSettings = useFileSpaceSettings((state) => state.bySpace[spaceId])
  const showHiddenFiles = viewSettings?.showHiddenFiles ?? false
  const showObsidianFolder = viewSettings?.showObsidianFolder ?? false
  const defaultBaseTemplate = viewSettings?.defaultBaseTemplate ?? "blank"
  const hasExtensionSourceContainer =
    entriesByDirectory.get("")?.some((entry) => entry.path === ".eidos") ===
    true

  const blockMutationDuringRestore = useCallback(() => {
    if (!restoringVersion) return false
    setOperationError(
      versioningOperation === "discarding"
        ? "Wait for the file discard to finish before changing files."
        : "Wait for the Space restore to finish before changing files."
    )
    return true
  }, [restoringVersion, versioningOperation])

  const contextCommandsForEntry = useCallback(
    (entry: SpaceFileEntry): FileExtensionCommand[] =>
      extensionCommands.filter((command) =>
        (command.menus["files/context"] ?? []).some((item) =>
          matchesFileExtensionMenuWhen(item.when, entry)
        )
      ),
    [extensionCommands]
  )

  const runExtensionCommand = useCallback(
    async (entry: SpaceFileEntry, command: FileExtensionCommand) => {
      try {
        await executeExtensionCommand(command, entry.path)
      } catch (error) {
        setOperationError(
          error instanceof Error
            ? error.message
            : "The extension command failed."
        )
      }
    },
    [executeExtensionCommand]
  )

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
        const entries = await list(directory, {
          includeHidden: showHiddenFiles,
          includeObsidian: showObsidianFolder,
        })
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
    [list, showHiddenFiles, showObsidianFolder]
  )

  useEffect(() => {
    void loadDirectory("")
  }, [loadDirectory])

  useEffect(() => {
    if (
      extensionSourceRevealRef.current !== "idle" ||
      !hasExtensionSourceContainer
    ) {
      return
    }
    extensionSourceRevealRef.current = "loading"
    let cancelled = false
    void loadDirectory(".eidos").then(async (entries) => {
      if (cancelled) return
      const hasExtensions = entries.some(
        (entry) => entry.path === EXTENSION_SOURCE_ROOT
      )
      if (!hasExtensions) {
        extensionSourceRevealRef.current = "idle"
        return
      }
      setExpanded(
        (current) => new Set([...current, ".eidos", EXTENSION_SOURCE_ROOT])
      )
      await loadDirectory(EXTENSION_SOURCE_ROOT)
      if (!cancelled) extensionSourceRevealRef.current = "done"
    })
    return () => {
      cancelled = true
    }
  }, [hasExtensionSourceContainer, loadDirectory])

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
      const name =
        type === "create-file"
          ? uniqueSpaceEntryName(
              entries.map((entry) => entry.name),
              "Untitled",
              ".md"
            )
          : uniqueSpaceEntryName(
              entries.map((entry) => entry.name),
              "New folder"
            )
      const destinationPath = joinSpacePath(parentPath, name)
      try {
        if (type === "create-file") {
          if (!(await flushCurrentSpaceFile(spaceId, selectedPath))) {
            throw new Error(
              "Eidos could not save the current file. Resolve the error before opening another file."
            )
          }
          await createText(destinationPath)
        } else {
          await createDirectory(destinationPath)
        }
        const createdEntry: SpaceFileEntry = {
          kind: type === "create-file" ? "file" : "directory",
          name,
          parentPath,
          path: destinationPath,
          size: 0,
          mtimeMs: Date.now(),
        }
        treeRef.current?.beginCreate(createdEntry)
        await loadDirectory(parentPath)
        if (type === "create-file") navigate(toSpaceFileUrl(destinationPath))
      } catch (operationFailure) {
        setOperationError(
          operationFailure instanceof Error
            ? operationFailure.message
            : "Unable to create this item"
        )
      }
    },
    [
      blockMutationDuringRestore,
      createDirectory,
      createText,
      entriesByDirectory,
      loadDirectory,
      navigate,
      selectedPath,
      spaceId,
    ]
  )

  const openBaseDialog = useCallback(
    async (parentPath = "") => {
      if (blockMutationDuringRestore()) return
      setOperationError(null)
      const entries = entriesByDirectory.has(parentPath)
        ? (entriesByDirectory.get(parentPath) ?? [])
        : await loadDirectory(parentPath)
      setBaseInitialName(
        uniqueSpaceEntryName(
          entries.map((entry) => entry.name),
          "Untitled",
          ".base"
        )
      )
      setBaseParentPath(parentPath)
      setBaseDialogOpen(true)
    },
    [blockMutationDuringRestore, entriesByDirectory, loadDirectory]
  )

  const createBaseAtPath = useCallback(
    async (name: string, options: CreateBaseOptions) => {
      if (blockMutationDuringRestore()) return
      setOperationError(null)
      try {
        if (!(await flushCurrentSpaceFile(spaceId, selectedPath))) {
          throw new Error(
            "Eidos could not save the current file. Resolve the error before opening another file."
          )
        }
        const destinationPath = joinSpacePath(baseParentPath, name)
        await createBase(destinationPath, options)
        setFilesExpanded(true)
        if (baseParentPath) {
          setExpanded((current) => new Set(current).add(baseParentPath))
        }
        await loadDirectory(baseParentPath)
        navigate(toSpaceFileUrl(destinationPath))
      } catch (operationFailure) {
        const message =
          operationFailure instanceof Error
            ? operationFailure.message
            : "Unable to create Base"
        setOperationError(message)
        throw operationFailure
      }
    },
    [
      blockMutationDuringRestore,
      baseParentPath,
      createBase,
      loadDirectory,
      navigate,
      selectedPath,
      spaceId,
    ]
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

  const moveInto = useCallback(
    async (entry: SpaceFileEntry, directory: string) => {
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
    [performMove]
  )

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
    async (entry: SpaceFileEntry, editorId?: string | null) => {
      const resolvedEditorId = isExtensionSourceTreePath(entry.path)
        ? undefined
        : editorId === undefined
          ? (await loadExtensionEditors(entry.path)).find(
              (editor) => editor.priority === "default"
            )?.id
          : (editorId ?? undefined)
      const navigated = await navigateAfterFlushingSpaceFile({
        spaceId,
        currentFilePath: selectedPath,
        destination: resolvedEditorId
          ? toSpaceFileEditorUrl(entry.path, resolvedEditorId)
          : toSpaceFileUrl(entry.path),
        navigate,
      })
      if (!navigated) {
        setOperationError(
          "Eidos could not save the current file. Resolve the error before opening another file."
        )
      }
    },
    [loadExtensionEditors, navigate, selectedPath, spaceId]
  )

  const renameEntry = useCallback(
    async (entry: SpaceFileEntry, destinationPath: string) => {
      const nextName = destinationPath.split("/").at(-1) ?? ""
      const validationError = validateSpaceEntryName(nextName)
      if (validationError) {
        setOperationError(validationError)
        await loadDirectory(entry.parentPath)
        return
      }
      setOperationError(null)
      try {
        await performMove(entry, destinationPath)
      } catch (operationFailure) {
        setOperationError(
          operationFailure instanceof Error
            ? operationFailure.message
            : "Unable to rename this item"
        )
        await loadDirectory(entry.parentPath)
      }
    },
    [loadDirectory, performMove]
  )

  const loadedEntries = useMemo(
    () => [...entriesByDirectory.values()].flat(),
    [entriesByDirectory]
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        data-file-tree-workbar
        className="eidos-shell-workbar group/explorer flex shrink-0 items-center border-b border-sidebar-border/50 px-1"
      >
        <button
          type="button"
          className="flex h-[22px] min-w-0 flex-1 items-center gap-0.5 rounded-[3px] px-0.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/75 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring"
          aria-expanded={filesExpanded}
          onClick={() => setFilesExpanded((current) => !current)}
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
            title="New Base"
            aria-label="New Base"
            disabled={restoringVersion}
            onClick={() => void openBaseDialog("")}
          >
            <Table2 className="h-3.5 w-3.5" />
          </Button>
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
            onClick={() => treeRef.current?.collapseAll()}
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
                onSelect={() => void openBaseDialog("")}
              >
                <Table2 />
                New Base
              </DropdownMenuItem>
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
      ) : (entriesByDirectory.get("")?.length ?? 0) === 0 ? (
        <div className="px-5 py-3 text-xs leading-relaxed text-muted-foreground">
          <p>This Space has no files yet.</p>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              className="text-sidebar-foreground underline decoration-border underline-offset-2 hover:decoration-sidebar-foreground"
              onClick={() => void startCreate("", "create-file")}
            >
              Create a note
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              className="text-sidebar-foreground underline decoration-border underline-offset-2 hover:decoration-sidebar-foreground"
              onClick={() => void openBaseDialog("")}
            >
              Create a Base
            </button>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <SpaceFilesTree
            ref={treeRef}
            entries={loadedEntries}
            expandedPaths={expanded}
            selectedPath={selectedPath}
            disabled={restoringVersion}
            canMove={(entry, destinationParent) =>
              !isExtensionSourceTreePath(entry.path) &&
              !isExtensionSourceTreePath(destinationParent) &&
              canMoveSpaceEntryTo(
                entry.path,
                entry.parentPath,
                entry.kind === "directory",
                destinationParent
              )
            }
            onCreate={(parentPath, type) => {
              if (type === "create-base") void openBaseDialog(parentPath)
              else void startCreate(parentPath, type)
            }}
            onDelete={(entry) => void deleteEntry(entry)}
            onExpandedPathsChange={setExpanded}
            onExpand={(path) => {
              if (!entriesByDirectory.has(path) && !loading.has(path)) {
                void loadDirectory(path)
              }
            }}
            onImport={(parentPath) => void importInto(parentPath)}
            onIntent={(entry) => {
              if (isExtensionSourceTreePath(entry.path)) return
              void loadExtensionEditors(entry.path)
              if (entry.path.toLowerCase().endsWith(".base")) {
                void preloadSpaceBaseEditor().catch(() => undefined)
              }
            }}
            onMove={(entry, destinationParent) =>
              void moveInto(entry, destinationParent)
            }
            onOpen={(entry) => void openFile(entry)}
            extensionEditors={(entry) =>
              isExtensionSourceTreePath(entry.path)
                ? []
                : extensionEditorsFor(entry.path)
            }
            loadExtensionEditors={(entry) =>
              isExtensionSourceTreePath(entry.path)
                ? Promise.resolve([])
                : loadExtensionEditors(entry.path)
            }
            onOpenWith={(entry, editorId) => void openFile(entry, editorId)}
            onRename={(entry, destinationPath) =>
              void renameEntry(entry, destinationPath)
            }
            onReveal={(path) =>
              void reveal(path === ".eidos" ? EXTENSION_SOURCE_ROOT : path)
            }
            isProtected={(entry) => isExtensionSourceTreePath(entry.path)}
            extensionCommands={(entry) =>
              isExtensionSourceTreePath(entry.path)
                ? []
                : contextCommandsForEntry(entry)
            }
            onExtensionCommand={(entry, command) =>
              void runExtensionCommand(entry, command)
            }
          />
        </div>
      )}

      <BaseCreatePopover
        open={baseDialogOpen}
        initialName={baseInitialName}
        initialTemplate={defaultBaseTemplate}
        existingNames={(entriesByDirectory.get(baseParentPath) ?? []).map(
          (entry) => entry.name
        )}
        onOpenChange={setBaseDialogOpen}
        onCreate={createBaseAtPath}
      />
    </div>
  )
}
