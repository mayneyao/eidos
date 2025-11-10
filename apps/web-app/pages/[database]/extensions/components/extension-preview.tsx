import { forwardRef, useState, useEffect } from "react"
import type { IExtension } from "@/packages/core/meta-table/extension"
import { BlockExtensionType } from "@/packages/core/types/IExtension"
import type { IDirectoryEntry } from "@/packages/core/types/IExternalFileSystem"
import { ChevronDown, ChevronRight, File, Folder } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { BlockRenderer } from "@/components/block-renderer/block-renderer"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { cn } from "@/lib/utils"

interface ExtensionPreviewProps {
  script: IExtension
  currentCompiledDraftCode: string
  height?: number
  onCompileAndSubmit: () => Promise<void>
}

interface FileTreeNode extends IDirectoryEntry {
  children?: FileTreeNode[]
}

const FileTreeSelector = ({
  rootDir = "~/",
  selectedPath,
  onSelect,
  allowedExtensions,
}: {
  rootDir?: string
  selectedPath: string
  onSelect: (path: string) => void
  allowedExtensions?: string[]
}) => {
  const { sqlite } = useSqlite()
  const [treeData, setTreeData] = useState<FileTreeNode[]>([])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set())

  const loadDirectory = async (path: string) => {
    if (!sqlite?.fs) return
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

      setTreeData((prev) => {
        if (path === rootDir) {
          return sortedEntries
        }
        return updateTreeData(prev, path, sortedEntries)
      })
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

  useEffect(() => {
    if (rootDir) {
      loadDirectory(rootDir)
    }
  }, [rootDir, sqlite])

  const toggleNode = async (node: FileTreeNode) => {
    const newExpanded = new Set(expandedNodes)
    if (expandedNodes.has(node.path)) {
      newExpanded.delete(node.path)
    } else {
      newExpanded.add(node.path)
      if (node.kind === "directory" && !node.children) {
        await loadDirectory(node.path)
      }
    }
    setExpandedNodes(newExpanded)
  }

  const renderNode = (node: FileTreeNode, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.path)
    const isSelected = selectedPath === node.path
    const isDirectory = node.kind === "directory"
    const isLoading = loadingNodes.has(node.path)

    return (
      <div key={node.path}>
        <div
          className={cn(
            "flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-accent rounded-sm",
            isSelected && "bg-accent"
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => {
            if (isDirectory) {
              toggleNode(node)
            } else {
              onSelect(node.path)
            }
          }}
        >
          {isDirectory ? (
            <>
              {isLoading ? (
                <div className="w-4 h-4" />
              ) : isExpanded ? (
                <ChevronDown className="w-4 h-4 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 shrink-0" />
              )}
              <Folder className="w-4 h-4 shrink-0 text-muted-foreground" />
            </>
          ) : (
            <>
              <div className="w-4 h-4 shrink-0" />
              <File className="w-4 h-4 shrink-0 text-muted-foreground" />
            </>
          )}
          <span className="text-sm truncate">{node.name}</span>
        </div>
        {isDirectory && isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2">{treeData.map((node) => renderNode(node))}</div>
    </ScrollArea>
  )
}

export const ExtensionPreview = forwardRef<
  HTMLDivElement,
  ExtensionPreviewProps
>(({ script, currentCompiledDraftCode, height, onCompileAndSubmit }, ref) => {
  const [selectedFileHash, setSelectedFileHash] = useState<string>("")
  
  const isFileHandler = script.type === "block" && 
    script.meta?.type === BlockExtensionType.FileHandler

  if (!script.code) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">
          No preview available. Build first to see the preview.
        </p>
        <Button onClick={onCompileAndSubmit} size="sm">
          Build
        </Button>
      </div>
    )
  }

  return (
    <div className="h-full flex" ref={ref}>
      {isFileHandler && (
        <div className="w-80 border-r flex flex-col">
          <div className="flex-1 overflow-hidden">
            <FileTreeSelector
              rootDir="~/"
              selectedPath={selectedFileHash}
              onSelect={setSelectedFileHash}
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {script.type === "block" && (
          <BlockRenderer
            blockId={script.id}
            code={script.ts_code || ""}
            compiledCode={currentCompiledDraftCode || script.code || ""}
            env={{}}
            bindings={{}}
            height={height}
            hash={isFileHandler ? `#${selectedFileHash}` : undefined}
          />
        )}

        {script.type === "script" && (
          <div className="h-full overflow-auto p-2">
            <div className="text-sm text-muted-foreground">
              Script extensions run in the background and don't have a visual
              preview.
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

ExtensionPreview.displayName = "ScriptPreview"
