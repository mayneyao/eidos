import { useEffect, useMemo, useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
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
  className?: string
  selectedPath?: string | null
  onSelectPath?: (path: string) => void
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

function ChangeTreeRow({
  node,
  depth,
  expanded,
  selectedPath,
  onToggle,
  onSelectPath,
}: {
  node: ChangeTreeNode
  depth: number
  expanded: Set<string>
  selectedPath?: string | null
  onToggle: (path: string) => void
  onSelectPath?: (path: string) => void
}) {
  const isExpanded = node.directory && expanded.has(node.path)
  const Icon = iconForNode(node, isExpanded)
  const statusMeta = STATUS_META[node.status]
  const row = (
    <button
      type="button"
      aria-expanded={node.directory ? isExpanded : undefined}
      className={cn(
        "group flex h-[24px] w-full min-w-0 items-center pr-2 text-left text-[12px] text-sidebar-foreground/85 outline-hidden",
        "hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring",
        selectedPath === node.path &&
          "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
      style={{ paddingLeft: `${4 + depth * 12}px` }}
      title={node.path}
      onClick={() => {
        if (node.directory) onToggle(node.path)
        else onSelectPath?.(node.path)
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
      {row}
      {node.directory && isExpanded && node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => (
            <ChangeTreeRow
              key={`${child.directory ? "directory" : "file"}:${child.path}`}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedPath={selectedPath}
              onToggle={onToggle}
              onSelectPath={onSelectPath}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function VersionChangeTree({
  changes,
  className,
  selectedPath,
  onSelectPath,
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
          depth={0}
          expanded={expanded}
          selectedPath={selectedPath}
          onToggle={(path) => {
            setExpanded((current) => {
              const next = new Set(current)
              if (next.has(path)) next.delete(path)
              else next.add(path)
              return next
            })
          }}
          onSelectPath={onSelectPath}
        />
      ))}
    </ul>
  )
}
