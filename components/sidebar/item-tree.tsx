import { useState } from "react"
import { File, FileSpreadsheet, Folder, FolderOpenIcon } from "lucide-react"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { cn } from "@/lib/utils"

import { Button } from "../ui/button"
import { CreateNodeTrigger } from "./tree/create-node-trigger"
import { NodeTreeContainer } from "./tree/node-tree"

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
  const [showNodes, setShowNodes] = useState(false)

  const handleToggleShowNodes = () => {
    setShowNodes(!showNodes)
  }
  return (
    <>
      <div className="flex items-center">
        <Button
          variant={"ghost"}
          size="sm"
          onClick={handleToggleShowNodes}
          className="flex w-full justify-start font-normal"
          asChild
        >
          <span className="cursor-pointer select-none">
            {Icon}
            {title}
          </span>
        </Button>
        {!disableAdd && <CreateNodeTrigger />}
      </div>
      {showNodes && (
        <div className="mt-1 space-y-1 pl-4">
          <DndProvider backend={HTML5Backend} context={window}>
            <NodeTreeContainer nodes={allNodes} />
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
    case "table":
      return <FileSpreadsheet className={_className} />
    case "doc":
      return <File className={_className} />
    case "folder":
      return <Folder className={_className} />
    case "folder-open":
      return <FolderOpenIcon className={_className} />
    default:
      return <File className={_className} />
  }
}
