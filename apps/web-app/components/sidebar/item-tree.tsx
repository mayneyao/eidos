import { useState, useMemo, useCallback } from "react"
import { useLocalStorageState } from "ahooks"
import {
  CalendarDaysIcon,
  File,
  FileSpreadsheet,
  Folder,
  FolderOpenIcon,
  ViewIcon,
  Hash,
} from "lucide-react"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"

import type { ITreeNode} from "@/packages/core/types/ITreeNode";
import { TreeNodeType } from "@/packages/core/types/ITreeNode"
import { cn } from "@/lib/utils"

import { Button } from "../ui/button"
import { CreateNodeTrigger } from "./tree/create-node-trigger"
import { NodeTreeContainer } from "./tree/node-tree"
import type { IHoverTarget } from "./tree/store"

export const CurrentItemTree = ({
  allNodes,
  Icon,
  title,
  disableAdd,
}: {
  allNodes: ITreeNode[]
  title: string
  Icon: React.ReactNode
  disableAdd?: boolean
}) => {
  // Generate a unique container ID for each CurrentItemTree instance
  const containerId = useMemo(() => `tree-container-${Math.random().toString(36).substr(2, 9)}`, [])
  
  const [showNodes, setShowNodes] = useLocalStorageState(
    "root-node-tree-show-toggle",
    {
      defaultValue: true,
    }
  )

  // Independent state for each tree instance
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null)
  const [target, setTarget] = useState<IHoverTarget | null>(null)

  const handleToggleShowNodes = () => {
    setShowNodes(!showNodes)
  }

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
    <>
      <div className="flex items-center justify-between w-full">
        <Button
          variant={"ghost"}
          size="sm"
          onClick={handleToggleShowNodes}
          className="flex justify-start w-full font-normal"
          asChild
        >
          <span className="cursor-pointer select-none [&>svg]:!size-5">
            {Icon}
            {title}
          </span>
        </Button>
        {!disableAdd && <CreateNodeTrigger />}
      </div>
      {showNodes && (
        <div className="mt-1 w-full space-y-1 pl-4">
          <DndProvider backend={HTML5Backend} context={window}>
            <NodeTreeContainer 
              nodes={allNodes} 
              containerId={containerId}
              target={target}
              targetFolderId={targetFolderId}
              setTarget={handleSetTarget}
              setTargetFolderId={handleSetTargetFolderId}
            />
          </DndProvider>
        </div>
      )}
    </>
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
