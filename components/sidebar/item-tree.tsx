import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { File, FileSpreadsheet } from "lucide-react"

import { cn } from "@/lib/utils"
import { IFileNode } from "@/hooks/use-sqlite"

import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { NodeItem } from "./table-menu"

export const CurrentItemTree = ({
  allNodes,
  spaceName,
  isShareMode,
  currentNode,
  Icon,
  title,
}: {
  allNodes: IFileNode[]
  spaceName: string
  isShareMode: boolean
  currentNode: IFileNode | null
  title: string
  Icon: React.ReactNode
}) => {
  const [showNodes, setShowNodes] = useState(false)
  const searchParams = useSearchParams()

  const handleToggleShowNodes = () => {
    setShowNodes(!showNodes)
  }
  return (
    <>
      <Button
        variant={"ghost"}
        size="sm"
        onClick={handleToggleShowNodes}
        className="w-full justify-start font-normal"
        asChild
      >
        <span className="cursor-pointer">
          {Icon}
          {title}
        </span>
      </Button>
      {showNodes && (
        <ScrollArea className="grow px-2">
          <div className="space-y-1 p-2">
            {allNodes?.map((node, i) => {
              const link = isShareMode
                ? `/share/${spaceName}/${node.id}?` + searchParams.toString()
                : `/${spaceName}/${node.id}`
              return (
                <NodeItem node={node} databaseName={spaceName} key={node.id}>
                  <Button
                    variant={
                      node.id === currentNode?.id ? "secondary" : "ghost"
                    }
                    size="sm"
                    className="w-full justify-start font-normal"
                    asChild
                  >
                    <Link href={link}>
                      <ItemIcon type={node.type} className="pr-2" />
                      {node.name}
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

const ItemIcon = ({
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
