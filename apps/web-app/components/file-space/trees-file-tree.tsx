import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react"
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react"
import type {
  ContextMenuItem,
  ContextMenuOpenContext,
  FileTreeDirectoryHandle,
} from "@pierre/trees"
import {
  FilePlus2,
  FolderOpen,
  FolderPlus,
  PencilLine,
  Table2,
  Trash2,
  Upload,
} from "lucide-react"
import { FileTree, useFileTree } from "@pierre/trees/react"
import type { SpaceFileEntry } from "@eidos.space/file-space"

import { cn } from "@/lib/utils"

export interface SpaceFilesTreeHandle {
  beginCreate: (entry: SpaceFileEntry) => void
  collapseAll: () => void
  startRename: (path: string) => void
}

interface SpaceFilesTreeProps {
  entries: SpaceFileEntry[]
  expandedPaths: ReadonlySet<string>
  selectedPath: string | null
  disabled?: boolean
  onCreate: (
    parentPath: string,
    type: "create-file" | "create-directory" | "create-base"
  ) => void
  onDelete: (entry: SpaceFileEntry) => void
  onExpandedPathsChange: (paths: Set<string>) => void
  onExpand: (path: string) => void
  onImport: (parentPath: string) => void
  onMove: (entry: SpaceFileEntry, destinationParent: string) => void
  onOpen: (entry: SpaceFileEntry) => void
  onRename: (entry: SpaceFileEntry, destinationPath: string) => void
  onReveal: (path: string) => void
  canMove: (entry: SpaceFileEntry, destinationParent: string) => boolean
}

function toTreePath(entry: SpaceFileEntry): string {
  return entry.kind === "directory" ? `${entry.path}/` : entry.path
}

function fromTreePath(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : path
}

function getDirectoryHandle(
  model: ReturnType<typeof useFileTree>["model"],
  path: string
): FileTreeDirectoryHandle | null {
  const item = model.getItem(path)
  return item?.isDirectory() ? (item as FileTreeDirectoryHandle) : null
}

function eventTreePath(
  event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>
): string | null {
  for (const target of event.nativeEvent.composedPath()) {
    if (!(target instanceof HTMLElement)) continue
    const path = target.dataset.itemPath
    if (path) return path
  }
  return null
}

function SpaceTreeContextMenu({
  item,
  context,
  entry,
  disabled,
  onCreate,
  onDelete,
  onImport,
  onRename,
  onReveal,
}: {
  item: ContextMenuItem
  context: ContextMenuOpenContext
  entry: SpaceFileEntry
  disabled: boolean
  onCreate: SpaceFilesTreeProps["onCreate"]
  onDelete: SpaceFilesTreeProps["onDelete"]
  onImport: SpaceFilesTreeProps["onImport"]
  onRename: (path: string) => void
  onReveal: SpaceFilesTreeProps["onReveal"]
}) {
  const { refs, floatingStyles } = useFloating({
    placement: "bottom-end",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
  })

  useLayoutEffect(() => {
    refs.setReference(context.anchorElement)
    return () => refs.setReference(null)
  }, [context.anchorElement, refs])

  useLayoutEffect(() => {
    refs.floating.current
      ?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')
      ?.focus()
  }, [refs])

  const run = (action: () => void) => {
    context.close({ restoreFocus: false })
    action()
  }
  const itemClassName =
    "flex h-8 w-full items-center gap-2.5 rounded-[4px] px-2.5 text-left text-[13px] text-popover-foreground outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-45"

  const menu = (
    <div
      ref={refs.setFloating}
      data-file-tree-context-menu-root="true"
      className="z-50 max-h-[calc(100vh-1rem)] w-56 overflow-y-auto rounded-md border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
      style={floatingStyles}
      role="menu"
      aria-label={`Actions for ${entry.name}`}
      onKeyDown={(event) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          return
        }
        event.preventDefault()
        const menuItems = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            '[role="menuitem"]:not(:disabled)'
          )
        )
        if (menuItems.length === 0) return
        const currentIndex = menuItems.indexOf(
          document.activeElement as HTMLElement
        )
        const nextIndex =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? menuItems.length - 1
              : event.key === "ArrowDown"
                ? (currentIndex + 1 + menuItems.length) % menuItems.length
                : (currentIndex - 1 + menuItems.length) % menuItems.length
        menuItems[nextIndex]?.focus()
      }}
    >
      {item.kind === "directory" ? (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemClassName}
            disabled={disabled}
            onClick={() => run(() => onCreate(entry.path, "create-base"))}
          >
            <Table2 className="h-3.5 w-3.5" />
            New Base
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClassName}
            disabled={disabled}
            onClick={() => run(() => onCreate(entry.path, "create-file"))}
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            New note
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClassName}
            disabled={disabled}
            onClick={() => run(() => onCreate(entry.path, "create-directory"))}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New folder
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClassName}
            disabled={disabled}
            onClick={() => run(() => onImport(entry.path))}
          >
            <Upload className="h-3.5 w-3.5" />
            Import files…
          </button>
          <div className="my-1 h-px bg-border" role="separator" />
        </>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className={itemClassName}
        disabled={disabled}
        onClick={() => run(() => onRename(item.path))}
      >
        <PencilLine className="h-3.5 w-3.5" />
        Rename
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemClassName}
        onClick={() => run(() => onReveal(entry.path))}
      >
        <FolderOpen className="h-3.5 w-3.5" />
        Show in file manager
      </button>
      <button
        type="button"
        role="menuitem"
        className={cn(itemClassName, "text-destructive hover:text-destructive")}
        disabled={disabled}
        onClick={() => run(() => onDelete(entry))}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>
    </div>
  )

  return typeof document === "undefined" ? (
    menu
  ) : (
    <FloatingPortal>{menu}</FloatingPortal>
  )
}

const TREE_CSS = `
  :host {
    display: block;
    min-height: 0;
  }

  button[data-type="item"] {
    border-radius: 4px;
  }

  button[data-type="item"]:focus-visible {
    outline-offset: -1px;
  }
`

export const SpaceFilesTree = forwardRef<
  SpaceFilesTreeHandle,
  SpaceFilesTreeProps
>(function SpaceFilesTree(props, ref) {
  const propsRef = useRef(props)
  propsRef.current = props
  const entryByPathRef = useRef(new Map<string, SpaceFileEntry>())
  const expandedPathsRef = useRef(new Set<string>())

  const { model } = useFileTree({
    paths: [],
    density: 1,
    itemHeight: 32,
    initialExpansion: "closed",
    flattenEmptyDirectories: false,
    icons: { set: "standard", colored: false },
    stickyFolders: false,
    composition: {
      contextMenu: {
        enabled: true,
        triggerMode: "both",
        buttonVisibility: "when-needed",
      },
    },
    dragAndDrop: {
      canDrag: (paths) =>
        !propsRef.current.disabled &&
        paths.length === 1 &&
        entryByPathRef.current.has(fromTreePath(paths[0])),
      canDrop: ({ draggedPaths, target }) => {
        if (propsRef.current.disabled || draggedPaths.length !== 1) return false
        const entry = entryByPathRef.current.get(fromTreePath(draggedPaths[0]))
        if (!entry) return false
        const destinationParent = target.directoryPath
          ? fromTreePath(target.directoryPath)
          : ""
        return propsRef.current.canMove(entry, destinationParent)
      },
      onDropComplete: ({ draggedPaths, target }) => {
        const entry = entryByPathRef.current.get(
          fromTreePath(draggedPaths[0] ?? "")
        )
        if (!entry) return
        propsRef.current.onMove(
          entry,
          target.directoryPath ? fromTreePath(target.directoryPath) : ""
        )
      },
      onDropError: (error) => {
        console.error("Unable to move Space entry:", error)
      },
    },
    renaming: {
      canRename: ({ path }) =>
        !propsRef.current.disabled &&
        entryByPathRef.current.has(fromTreePath(path)),
      onError: (error) => {
        console.error("Unable to rename Space entry:", error)
      },
      onRename: ({ sourcePath, destinationPath }) => {
        const entry = entryByPathRef.current.get(fromTreePath(sourcePath))
        if (entry) {
          propsRef.current.onRename(entry, fromTreePath(destinationPath))
        }
      },
    },
    unsafeCSS: TREE_CSS,
  })

  const treePaths = useMemo(
    () => props.entries.map(toTreePath),
    [props.entries]
  )
  const treePathSignature = treePaths.join("\u0000")

  entryByPathRef.current = new Map(
    props.entries.map((entry) => [entry.path, entry])
  )

  useEffect(() => {
    const expandedTreePaths = props.entries
      .filter(
        (entry) =>
          entry.kind === "directory" &&
          (props.expandedPaths.has(entry.path) ||
            getDirectoryHandle(model, toTreePath(entry))?.isExpanded() === true)
      )
      .map(toTreePath)
    model.resetPaths(treePaths, {
      initialExpandedPaths: expandedTreePaths,
    })
  }, [model, treePathSignature])

  useEffect(() => {
    const synchronizeExpansion = () => {
      const next = new Set<string>()
      for (const entry of propsRef.current.entries) {
        if (entry.kind !== "directory") continue
        const item = getDirectoryHandle(model, toTreePath(entry))
        if (!item?.isExpanded()) continue
        next.add(entry.path)
        propsRef.current.onExpand(entry.path)
      }
      const current = expandedPathsRef.current
      if (
        current.size === next.size &&
        [...current].every((path) => next.has(path))
      ) {
        return
      }
      expandedPathsRef.current = next
      propsRef.current.onExpandedPathsChange(next)
    }
    synchronizeExpansion()
    return model.subscribe(synchronizeExpansion)
  }, [model])

  useEffect(() => {
    if (!props.selectedPath) return
    const entry = entryByPathRef.current.get(props.selectedPath)
    if (!entry) return
    const pathSegments = entry.path.split("/")
    for (let index = 1; index < pathSegments.length; index += 1) {
      getDirectoryHandle(
        model,
        `${pathSegments.slice(0, index).join("/")}/`
      )?.expand()
    }
    const treePath = toTreePath(entry)
    const item = model.getItem(treePath)
    if (!item || item.isSelected()) return
    item.select()
    model.scrollToPath(treePath, { offset: "nearest", focus: false })
  }, [model, props.selectedPath, treePathSignature])

  useImperativeHandle(
    ref,
    () => ({
      beginCreate: (entry) => {
        const treePath = toTreePath(entry)
        entryByPathRef.current.set(entry.path, entry)
        if (!model.getItem(treePath)) model.add(treePath)
        model.startRenaming(treePath)
      },
      collapseAll: () => {
        for (const entry of entryByPathRef.current.values()) {
          if (entry.kind !== "directory") continue
          getDirectoryHandle(model, toTreePath(entry))?.collapse()
        }
      },
      startRename: (path) => {
        const entry = entryByPathRef.current.get(fromTreePath(path))
        if (entry) model.startRenaming(toTreePath(entry))
      },
    }),
    [model]
  )

  const treeStyles = {
    height: "100%",
    minHeight: 0,
    width: "100%",
    "--trees-bg-override": "transparent",
    "--trees-bg-muted-override": "hsl(var(--sidebar-accent))",
    "--trees-border-color-override": "hsl(var(--sidebar-border))",
    "--trees-fg-override": "hsl(var(--sidebar-foreground))",
    "--trees-fg-muted-override": "hsl(var(--sidebar-foreground) / 0.62)",
    "--trees-font-family-override": "inherit",
    "--trees-font-size-override": "13px",
    "--trees-focus-ring-color-override": "hsl(var(--sidebar-ring))",
    "--trees-focus-ring-offset-override": "-1px",
    "--trees-focus-ring-width-override": "1px",
    "--trees-icon-width-override": "16px",
    "--trees-item-margin-x-override": "4px",
    "--trees-item-row-gap-override": "6px",
    "--trees-item-padding-x-override": "6px",
    "--trees-level-gap-override": "12px",
    "--trees-padding-inline-override": "8px",
    "--trees-selected-bg-override": "hsl(var(--sidebar-accent))",
    "--trees-selected-fg-override": "hsl(var(--sidebar-accent-foreground))",
  } as CSSProperties

  return (
    <FileTree
      model={model}
      aria-label="Files"
      aria-disabled={props.disabled === true}
      className="block h-full min-h-0 w-full"
      style={treeStyles}
      onClick={(event) => {
        const path = eventTreePath(event)
        if (!path) return
        const entry = entryByPathRef.current.get(fromTreePath(path))
        if (entry?.kind === "file") propsRef.current.onOpen(entry)
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        const path = eventTreePath(event) ?? model.getFocusedPath()
        if (!path) return
        const entry = entryByPathRef.current.get(fromTreePath(path))
        if (entry?.kind === "file") propsRef.current.onOpen(entry)
      }}
      renderContextMenu={(item, context) => {
        const entry = entryByPathRef.current.get(fromTreePath(item.path))
        if (!entry) return null
        return (
          <SpaceTreeContextMenu
            item={item}
            context={context}
            entry={entry}
            disabled={props.disabled === true}
            onCreate={props.onCreate}
            onDelete={props.onDelete}
            onImport={props.onImport}
            onRename={(path) => {
              const renameEntry = entryByPathRef.current.get(fromTreePath(path))
              if (renameEntry) model.startRenaming(toTreePath(renameEntry))
            }}
            onReveal={props.onReveal}
          />
        )
      }}
    />
  )
})
