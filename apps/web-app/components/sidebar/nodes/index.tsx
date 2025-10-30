import { useCallback, useMemo, useState } from "react"
import { TreeNodeType, type ITreeNode } from "@/packages/core/types/ITreeNode"
import {
  CalendarDaysIcon,
  File,
  FileSpreadsheet,
  Folder,
  FolderOpenIcon,
  Hash,
  ViewIcon,
} from "lucide-react"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"

import { cn } from "@/lib/utils"

import type { IHoverTarget } from "./store"
import { TreeSidebarHeader } from "./tree-sidebar-header"
import { VirtualNodeTreeContainer } from "./virtual-node-tree"
import { SearchResults } from "./search-results"
import { useTreeSidebarStore } from "./tree-sidebar-store"

export const CurrentItemTree = ({
  allNodes,
  allNodesForVirtual,
  Icon,
  title,
  disableAdd,
}: {
  allNodes: ITreeNode[]
  allNodesForVirtual?: ITreeNode[]
  title: string
  Icon: React.ReactNode
  disableAdd?: boolean
}) => {
  // Generate a unique container ID for each CurrentItemTree instance
  const containerId = useMemo(
    () => `tree-container-${Math.random().toString(36).substr(2, 9)}`,
    []
  )

  // Independent state for each tree instance
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null)
  const [target, setTarget] = useState<IHoverTarget | null>(null)

  const { isSearchMode } = useTreeSidebarStore()

  const handleSetTarget = useCallback((newTarget: IHoverTarget | null) => {
    setTarget(newTarget)
    if (newTarget) {
      setTargetFolderId(null)
    }
  }, [])

  const handleSetTargetFolderId = useCallback((id: string | null) => {
    setTargetFolderId(id)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <TreeSidebarHeader disableAdd={disableAdd} />
      <div className="flex-1 min-h-0 p-1 w-full">
        {isSearchMode ? (
          <SearchResults />
        ) : (
          <DndProvider backend={HTML5Backend} context={window}>
            <VirtualNodeTreeContainer
              nodes={allNodes}
              allNodes={allNodesForVirtual || allNodes}
              containerId={containerId}
              target={target}
              targetFolderId={targetFolderId}
              setTarget={handleSetTarget}
              setTargetFolderId={handleSetTargetFolderId}
            />
          </DndProvider>
        )}
      </div>
    </div>
  )
}

export const ItemIcon = ({
  type,
  className,
}: {
  type: string
  className?: string
}) => {
  const _className = cn("opacity-60", className)
  switch (type) {
    case TreeNodeType.Table:
      return <FileSpreadsheet className={_className} />
    case TreeNodeType.Doc:
      return <File className={_className} />
    case TreeNodeType.Dataview:
      return <ViewIcon className={_className} />
    case "folder":
      return <Folder className={_className} />
    case "folder-open":
      return <FolderOpenIcon className={_className} />
    case "day":
      return <CalendarDaysIcon className={_className} />
    case "property":
      return <Hash className={_className} />
    default:
      return <File className={_className} />
  }
}
