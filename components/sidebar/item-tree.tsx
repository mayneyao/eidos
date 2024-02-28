import { useState } from "react"
import { File, FileSpreadsheet, Plus } from "lucide-react"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { cn } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useGoto } from "@/hooks/use-goto"
import { useSqlite } from "@/hooks/use-sqlite"

import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { NodeTreeContainer } from "./tree/node-tree"

export const CurrentItemTree = ({
  allNodes,
  Icon,
  title,
  type,
  disableAdd,
}: {
  allNodes: ITreeNode[]
  title: string
  type: "table" | "doc" | "all"
  Icon: React.ReactNode
  disableAdd?: boolean
}) => {
  const [showNodes, setShowNodes] = useState(false)

  const { space } = useCurrentPathInfo()

  const { createDoc, createTable } = useSqlite(space)
  const goto = useGoto()

  const handleCreateDoc = async () => {
    const docId = await createDoc("")
    goto(space, docId)
  }

  const handleCreateTable = async () => {
    const tableId = await createTable("")
    goto(space, tableId)
  }

  const handleCreateNode = () => {
    switch (type) {
      case "table":
        handleCreateTable()
        break
      case "doc":
        handleCreateDoc()
        break
    }
    setShowNodes(true)
  }

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
        {!disableAdd && (
          <Button
            className=""
            variant="ghost"
            size="sm"
            onClick={handleCreateNode}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>
      {showNodes && (
        <ScrollArea className="grow px-2">
          <div className="space-y-1 p-2">
            <DndProvider backend={HTML5Backend} context={window}>
              <NodeTreeContainer nodes={allNodes} />
            </DndProvider>
          </div>
        </ScrollArea>
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
    default:
      return <File className={_className} />
  }
}
