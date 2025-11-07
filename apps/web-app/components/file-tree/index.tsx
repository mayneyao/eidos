"use client"

import React, { useEffect, useState } from "react"
import type { IDirectoryEntry } from "@eidos.space/core/types/IExternalFileSystem"
import {
  BlocksIcon,
  ChevronDown,
  ChevronRight,
  File,
  FileSpreadsheet,
  Folder,
  Pin,
} from "lucide-react"
import { useNavigate } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSqlite } from "@/hooks/use-sqlite"
import { IconRenderer } from "@/components/ui/icon-picker"
import { ScrollArea } from "@/components/ui/scroll-area"

interface FileTreeNode extends IDirectoryEntry {
  children?: FileTreeNode[]
}

interface FileTreeProps {
  /** Root directory path, defaults to "~/" */
  rootDir?: string
}

const FileTree = ({ rootDir = "~/" }: FileTreeProps) => {
  const { sqlite } = useSqlite()
  const navigate = useNavigate()
  const { space } = useCurrentPathInfo()

  const [treeData, setTreeData] = useState<FileTreeNode[]>([])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set())

  const loadRootDirectory = async () => {
    if (!sqlite || !rootDir) return

    try {
      const entries = await sqlite.fs.readdir(rootDir, {
        withFileTypes: true,
      })

      const sortedEntries = entries.sort((a, b) => {
        if (a.kind === "directory" && b.kind !== "directory") return -1
        if (a.kind !== "directory" && b.kind === "directory") return 1
        return a.name.localeCompare(b.name)
      })

      setTreeData(sortedEntries)
    } catch (error) {
      console.error("Failed to load root directory:", error)
    }
  }

  const loadSubDirectory = async (path: string) => {
    if (!sqlite) return
    if (loadingNodes.has(path)) return

    setLoadingNodes((prev) => new Set(prev).add(path))

    try {
      const entries = await sqlite.fs.readdir(path, {
        withFileTypes: true,
      })

      const sortedEntries = entries.sort((a, b) => {
        if (a.kind === "directory" && b.kind !== "directory") return -1
        if (a.kind !== "directory" && b.kind === "directory") return 1
        return a.name.localeCompare(b.name)
      })

      const updateTreeData = (
        nodes: FileTreeNode[],
        targetPath: string,
        newChildren: FileTreeNode[]
      ): FileTreeNode[] => {
        return nodes.map((node) => {
          if (node.path === targetPath) {
            return { ...node, children: newChildren }
          }
          if (node.children) {
            return {
              ...node,
              children: updateTreeData(node.children, targetPath, newChildren),
            }
          }
          return node
        })
      }

      setTreeData((prev) => updateTreeData(prev, path, sortedEntries))
    } catch (error) {
      console.error(`Failed to load directory ${path}:`, error)
    } finally {
      setLoadingNodes((prev) => {
        const newSet = new Set(prev)
        newSet.delete(path)
        return newSet
      })
    }
  }

  const toggleNode = async (node: FileTreeNode) => {
    const newExpanded = new Set(expandedNodes)
    if (expandedNodes.has(node.path)) {
      newExpanded.delete(node.path)
    } else {
      newExpanded.add(node.path)
      if (node.kind === "directory" && !node.children) {
        await loadSubDirectory(node.path)
      }
    }
    setExpandedNodes(newExpanded)
  }

  const handleFileClick = (node: FileTreeNode) => {
    if (!space) {
      console.error("Space not available for navigation")
      return
    }

    // Route based on metadata type
    if (node.metadata?.nodeType && node.metadata?.nodeType !== "extension") {
      // Navigate to node (table, doc, folder, dataview)
      navigate(`/${node.metadata.nodeId}`)
    } else if (node.metadata?.nodeType === "extension") {
      // Navigate to extension
      navigate(`/extensions/${node.metadata.nodeId}`)
    } else {
      // Regular file - use file handler
      navigate(`/file-handler#${node.path}`)
    }
  }

  const getNodeIcon = (node: FileTreeNode) => {
    // Use custom icon from metadata if available
    if (node.metadata?.icon) {
      return (
        <IconRenderer name={node.metadata.icon as any} className="w-4 h-4" />
      )
    }

    // Use default icons based on node type
    if (node.kind === "directory") {
      return <Folder className="w-4 h-4 text-muted-foreground" />
    }

    switch (node.metadata?.nodeType) {
      case "table":
        return <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
      case "doc":
        return <File className="w-4 h-4 text-muted-foreground" />
      case "extension":
        return <BlocksIcon className="w-4 h-4 text-muted-foreground" />
      case "folder":
        return <Folder className="w-4 h-4 text-muted-foreground" />
      default:
        return <File className="w-4 h-4 text-muted-foreground" />
    }
  }

  const renderTreeNode = (node: FileTreeNode, level = 0) => {
    const isExpanded = expandedNodes.has(node.path)
    const isLoading = loadingNodes.has(node.path)
    const hasChildren = node.kind === "directory"
    const isPinned = node.metadata?.isPinned

    return (
      <div key={node.path} className="min-w-0">
        <div
          className="flex items-center hover:bg-accent rounded transition-colors cursor-pointer select-none"
          onClick={() => {
            if (hasChildren) {
              toggleNode(node)
            } else {
              handleFileClick(node)
            }
          }}
        >
          <div style={{ width: level * 18 }} className="flex-shrink-0" />
          <div className="w-4 flex-shrink-0 flex items-center justify-center">
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleNode(node)
                }}
                className="p-0 hover:bg-accent rounded transition-colors"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-border border-t-primary" />
                ) : isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            ) : (
              getNodeIcon(node)
            )}
          </div>
          <div className="flex items-center gap-1 px-2 py-1 min-w-0 flex-1">
            <span className="truncate text-foreground">{node.name}</span>
            {isPinned && (
              <Pin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            )}
          </div>
        </div>
        {hasChildren && isExpanded && node.children && (
          <div className="ml-0">
            {node.children.map((child) => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  useEffect(() => {
    if (sqlite && rootDir) {
      loadRootDirectory()
    }
  }, [sqlite, rootDir])

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 px-4 bg-sidebar">
        {treeData.map((node) => renderTreeNode(node, 0))}
      </div>
    </ScrollArea>
  )
}

export default FileTree
