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
import { useKeyPress } from "ahooks"

import { cn } from "@/lib/utils"

import { CreateNodeTrigger } from "./tree/create-node-trigger"
import { VirtualNodeTreeContainer } from "./tree/virtual-node-tree"
import { TreeSidebarHeader } from "./tree/tree-sidebar-header"
import type { IHoverTarget } from "./tree/store"

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
  const [showSearch, setShowSearch] = useState(false)

  // Keyboard shortcut: Shift + Cmd/Ctrl + F to toggle search
  useKeyPress(["shift.ctrl.f", "shift.meta.f"], (e) => {
    e.preventDefault()
    setShowSearch(!showSearch)
  })

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
      <TreeSidebarHeader
        showSearch={showSearch}
        onToggleSearch={() => setShowSearch(!showSearch)}
        onExitSearch={() => setShowSearch(false)}
        disableAdd={disableAdd}
      />
      <div className="flex-1 min-h-0 w-full">
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
