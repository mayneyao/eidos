import { useState } from "react"
import { ITreeNode } from "@/worker/meta_table/tree"
import { File, FileSpreadsheet, Plus } from "lucide-react"
import { Link, useSearchParams } from "react-router-dom"

import { cn } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useGoto } from "@/hooks/use-goto"
import { useSqlite } from "@/hooks/use-sqlite"

import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { NodeItem } from "./node-menu"

export const CurrentItemTree = ({
  allNodes,
  allTableNodes = [],
  spaceName,
  isShareMode,
  currentNode,
  Icon,
  title,
  type,
}: {
  allNodes: ITreeNode[]
  allTableNodes?: ITreeNode[]
  spaceName: string
  isShareMode: boolean
  currentNode: ITreeNode | null
  title: string
  type: "table" | "doc"
  Icon: React.ReactNode
}) => {
  const [showNodes, setShowNodes] = useState(false)
  const [searchParams] = useSearchParams()

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
        <Button
          className=""
          variant="ghost"
          size="sm"
          onClick={handleCreateNode}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {showNodes && (
        <ScrollArea className="grow px-2">
          <div className="space-y-1 p-2">
            {allNodes?.map((node, i) => {
              const link = isShareMode
                ? `/share/${spaceName}/${node.id}?` + searchParams.toString()
                : `/${spaceName}/${node.id}`
              return (
                <NodeItem
                  node={node}
                  databaseName={spaceName}
                  key={node.id}
                  tableNodes={allTableNodes}
                >
                  <Button
                    variant={
                      node.id === currentNode?.id ? "secondary" : "ghost"
                    }
                    size="sm"
                    className="w-full justify-start font-normal"
                    asChild
                  >
                    <Link to={link}>
                      <ItemIcon type={node.type} className="pr-2" />
                      <span className="truncate" title={node.name}>
                        {node.name.length === 0 ? "Untitled" : node.name}
                      </span>
                    </Link>
                  </Button>
                </NodeItem>
              )
            })}
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
