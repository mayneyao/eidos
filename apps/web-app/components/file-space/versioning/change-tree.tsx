import { useEffect, useMemo, useState } from "react"
import {
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  File,
  FileCode2,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  GitMerge,
  LoaderCircle,
  Minus,
  Plus,
  Undo2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { SpaceVersionChange } from "@/apps/web-app/hooks/use-space-versioning"

import {
  STATUS_META,
  buildChangeTree,
  collectDirectoryPaths,
  type ChangeTreeNode,
} from "./versioning-utils"

interface VersionChangeTreeProps {
  changes: SpaceVersionChange[]
  mode?: "staged" | "unstaged" | "mixed"
  className?: string
  selectedPath?: string | null
  busyPath?: string | null
  actionsDisabled?: boolean
  onOpenDiff?: (path: string) => void
  onRevealPath?: (path: string) => void
  onStagePath?: (path: string) => void
  onUnstagePath?: (path: string) => void
  onDiscardPath?: (path: string) => void
  onResolveConflict?: (path: string) => void
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

function iconForNode(node: ChangeTreeNode, expanded: boolean) {
  if (node.directory) return expanded ? FolderOpen : Folder
  const extension = node.name.split(".").pop()?.toLowerCase() ?? ""
  if (["md", "markdown", "txt"].includes(extension)) return FileText
  if (IMAGE_EXTENSIONS.has(extension)) return FileImage
  if (CODE_EXTENSIONS.has(extension)) return FileCode2
  return File
}

function nodeHasConflict(node: ChangeTreeNode): boolean {
  return node.change?.conflicted === true || node.children.some(nodeHasConflict)
}

function ChangeTreeRow({
  node,
  mode,
  depth,
  expanded,
  selectedPath,
  busyPath,
  actionsDisabled,
  onToggle,
  onOpenDiff,
  onRevealPath,
  onStagePath,
  onUnstagePath,
  onDiscardPath,
  onResolveConflict,
}: {
  node: ChangeTreeNode
  mode: "staged" | "unstaged" | "mixed"
  depth: number
  expanded: Set<string>
  selectedPath?: string | null
  busyPath?: string | null
  actionsDisabled?: boolean
  onToggle: (path: string) => void
  onOpenDiff?: (path: string) => void
  onRevealPath?: (path: string) => void
  onStagePath?: (path: string) => void
  onUnstagePath?: (path: string) => void
  onDiscardPath?: (path: string) => void
  onResolveConflict?: (path: string) => void
}) {
  const isExpanded = node.directory && expanded.has(node.path)
  const fileUnavailable = !node.directory && node.status === "deleted"
  const Icon = iconForNode(node, isExpanded)
  const statusMeta = STATUS_META[node.status]
  const fullyIncluded =
    node.change?.staged === true && node.change.unstaged !== true
  const shouldUnstage = mode === "staged" || (mode === "mixed" && fullyIncluded)
  const mainButton = (
    <button
      type="button"
      aria-expanded={node.directory ? isExpanded : undefined}
      disabled={!node.directory && actionsDisabled}
      className={cn(
        "flex h-[24px] min-w-0 flex-1 items-center text-left text-[12px] text-sidebar-foreground/85 outline-hidden",
        "hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring",
        selectedPath === node.path &&
          "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
      style={{ paddingLeft: `${4 + depth * 12}px` }}
      title={node.path}
      onClick={() => {
        if (node.directory) onToggle(node.path)
        else onOpenDiff?.(node.path)
      }}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-sidebar-foreground/55">
        {node.directory ? (
          isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )
        ) : null}
      </span>
      <Icon className="mr-1.5 h-3.5 w-3.5 shrink-0 text-sidebar-foreground/55" />
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          node.status === "deleted" &&
            !node.directory &&
            "line-through opacity-75"
        )}
      >
        {node.name}
      </span>
      {node.change?.staged ? (
        <span
          className="ml-1 flex h-3 w-3 shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400"
          aria-label="Included in the next version"
          title="Included in the next version"
        >
          <Check className="h-3 w-3" />
        </span>
      ) : null}
      <span
        className={cn(
          "ml-2 w-3 shrink-0 text-right text-[10px] font-semibold",
          statusMeta.className
        )}
        aria-label={statusMeta.label}
        title={statusMeta.label}
      >
        {node.directory ? "" : statusMeta.shortLabel}
      </span>
    </button>
  )

  return (
    <li>
      {node.directory ? (
        <div className="group relative flex h-[24px] min-w-0 items-center pr-1 hover:bg-sidebar-accent/70 focus-within:bg-sidebar-accent">
          {mainButton}
          {(onStagePath || onUnstagePath || onDiscardPath) &&
          !nodeHasConflict(node) ? (
            <div className="absolute right-1 top-0 flex h-[24px] items-center bg-sidebar-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              {onStagePath || onUnstagePath ? (
                <button
                  type="button"
                  className="flex h-5 w-5 items-center justify-center rounded-[3px] text-sidebar-foreground/60 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring disabled:opacity-40"
                  aria-label={
                    shouldUnstage
                      ? `Exclude directory ${node.path} from the next version`
                      : `Include directory ${node.path} in the next version`
                  }
                  title={
                    shouldUnstage
                      ? "Exclude directory from next version"
                      : "Include directory in next version"
                  }
                  disabled={actionsDisabled || busyPath === node.path}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (shouldUnstage) onUnstagePath?.(node.path)
                    else onStagePath?.(node.path)
                  }}
                >
                  {busyPath === node.path ? (
                    <LoaderCircle className="h-3 w-3 animate-spin" />
                  ) : shouldUnstage ? (
                    <Minus className="h-3 w-3" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                </button>
              ) : null}
              {onDiscardPath ? (
                <button
                  type="button"
                  className="flex h-5 w-5 items-center justify-center rounded-[3px] text-sidebar-foreground/60 outline-hidden hover:bg-destructive/10 hover:text-destructive focus-visible:ring-1 focus-visible:ring-sidebar-ring disabled:opacity-40"
                  aria-label={`Discard changes in directory ${node.path}`}
                  title="Discard directory changes…"
                  disabled={actionsDisabled || busyPath === node.path}
                  onClick={(event) => {
                    event.stopPropagation()
                    onDiscardPath(node.path)
                  }}
                >
                  {busyPath === node.path ? (
                    <LoaderCircle className="h-3 w-3 animate-spin" />
                  ) : (
                    <Undo2 className="h-3 w-3" />
                  )}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className={cn(
            "group relative flex h-[24px] min-w-0 items-center pr-1",
            "hover:bg-sidebar-accent/70 focus-within:bg-sidebar-accent",
            selectedPath === node.path &&
              "bg-sidebar-accent text-sidebar-accent-foreground"
          )}
        >
          {mainButton}
          <div className="absolute right-1 top-0 flex h-[24px] items-center bg-sidebar-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded-[3px] text-sidebar-foreground/60 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring disabled:opacity-40"
              aria-label={
                fileUnavailable
                  ? `${node.path} cannot be opened because it was deleted`
                  : `Open ${node.path}`
              }
              title={
                fileUnavailable ? "Deleted files cannot be opened" : "Open file"
              }
              disabled={
                actionsDisabled || busyPath === node.path || fileUnavailable
              }
              onClick={() => onRevealPath?.(node.path)}
            >
              <ExternalLink className="h-3 w-3" />
            </button>
            {node.change?.conflicted ? (
              <button
                type="button"
                className="flex h-5 w-5 items-center justify-center rounded-[3px] text-amber-600 outline-hidden hover:bg-amber-500/10 focus-visible:ring-1 focus-visible:ring-sidebar-ring disabled:opacity-40 dark:text-amber-400"
                aria-label={`Resolve conflict in ${node.path}`}
                title="Resolve conflict…"
                disabled={actionsDisabled || busyPath === node.path}
                onClick={() => onResolveConflict?.(node.path)}
              >
                {busyPath === node.path ? (
                  <LoaderCircle className="h-3 w-3 animate-spin" />
                ) : (
                  <GitMerge className="h-3 w-3" />
                )}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="flex h-5 w-5 items-center justify-center rounded-[3px] text-sidebar-foreground/60 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring disabled:opacity-40"
                  aria-label={
                    shouldUnstage
                      ? `Exclude ${node.path} from the next version`
                      : `Include ${node.path} in the next version`
                  }
                  title={
                    shouldUnstage
                      ? "Exclude from next version"
                      : node.change?.staged
                        ? "Update included content"
                        : "Include in next version"
                  }
                  disabled={actionsDisabled || busyPath === node.path}
                  onClick={() =>
                    shouldUnstage
                      ? onUnstagePath?.(node.path)
                      : onStagePath?.(node.path)
                  }
                >
                  {busyPath === node.path ? (
                    <LoaderCircle className="h-3 w-3 animate-spin" />
                  ) : shouldUnstage ? (
                    <Minus className="h-3 w-3" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                </button>
                <button
                  type="button"
                  className="flex h-5 w-5 items-center justify-center rounded-[3px] text-sidebar-foreground/60 outline-hidden hover:bg-destructive/10 hover:text-destructive focus-visible:ring-1 focus-visible:ring-sidebar-ring disabled:opacity-40"
                  aria-label={`Discard changes to ${node.path}`}
                  title="Discard changes…"
                  disabled={actionsDisabled || busyPath === node.path}
                  onClick={() => onDiscardPath?.(node.path)}
                >
                  <Undo2 className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {node.directory && isExpanded && node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => (
            <ChangeTreeRow
              key={`${child.directory ? "directory" : "file"}:${child.path}`}
              node={child}
              mode={mode}
              depth={depth + 1}
              expanded={expanded}
              selectedPath={selectedPath}
              busyPath={busyPath}
              actionsDisabled={actionsDisabled}
              onToggle={onToggle}
              onOpenDiff={onOpenDiff}
              onRevealPath={onRevealPath}
              onStagePath={onStagePath}
              onUnstagePath={onUnstagePath}
              onDiscardPath={onDiscardPath}
              onResolveConflict={onResolveConflict}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function VersionChangeTree({
  changes,
  mode = "mixed",
  className,
  selectedPath,
  busyPath,
  actionsDisabled,
  onOpenDiff,
  onRevealPath,
  onStagePath,
  onUnstagePath,
  onDiscardPath,
  onResolveConflict,
}: VersionChangeTreeProps) {
  const tree = useMemo(() => buildChangeTree(changes), [changes])
  const directoryPaths = useMemo(() => collectDirectoryPaths(tree), [tree])
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(directoryPaths)
  )

  useEffect(() => {
    setExpanded((current) => {
      const next = new Set(current)
      for (const path of directoryPaths) next.add(path)
      return next
    })
  }, [directoryPaths])

  return (
    <ul className={cn("select-none py-0.5", className)}>
      {tree.map((node) => (
        <ChangeTreeRow
          key={`${node.directory ? "directory" : "file"}:${node.path}`}
          node={node}
          mode={mode}
          depth={0}
          expanded={expanded}
          selectedPath={selectedPath}
          busyPath={busyPath}
          actionsDisabled={actionsDisabled}
          onToggle={(path) => {
            setExpanded((current) => {
              const next = new Set(current)
              if (next.has(path)) next.delete(path)
              else next.add(path)
              return next
            })
          }}
          onOpenDiff={onOpenDiff}
          onRevealPath={onRevealPath}
          onStagePath={onStagePath}
          onUnstagePath={onUnstagePath}
          onDiscardPath={onDiscardPath}
          onResolveConflict={onResolveConflict}
        />
      ))}
    </ul>
  )
}
