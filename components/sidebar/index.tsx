"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  CalendarDays,
  Database,
  File,
  FileSpreadsheet,
  Files,
} from "lucide-react"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"
import { useCurrentNode } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useAllDatabases } from "@/hooks/use-database"
import { IFileNode, useSqlite, useSqliteStore } from "@/hooks/use-sqlite"
import { Separator } from "@/components/ui/separator"
import { DatabaseSelect } from "@/components/database-select"

import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { CreateFileDialog } from "./create-file"
import { TableListLoading } from "./loading"
import { NodeItem } from "./table-menu"

const CurrentItemTree = ({
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

export const SideBar = ({ className }: any) => {
  const { database } = useCurrentPathInfo()
  const currentNode = useCurrentNode()
  const [loading, setLoading] = useState(true)
  const { updateNodeList } = useSqlite(database)
  const { setSelectedTable, allNodes } = useSqliteStore()
  const databaseList = useAllDatabases()
  const { isShareMode } = useAppRuntimeStore()
  const { setSidebarOpen } = useAppRuntimeStore()
  const [currentItem, setCurrentItem] = useState("")

  const handleClickTable = (table: string) => {
    setSidebarOpen(false)
    setSelectedTable(table)
  }
  useEffect(() => {
    console.log("side bar loading all tables ")
    updateNodeList().then(() => {
      setLoading(false)
    })
  }, [updateNodeList])

  const databaseHomeLink = `/${database}`

  return (
    <>
      <div className={cn("flex h-full flex-col p-4", className)}>
        <div className="flex items-center justify-between">
          {!isShareMode && (
            <h2 className="relative px-6 text-lg font-semibold tracking-tight">
              <Link href={databaseHomeLink}>Eidos</Link>
            </h2>
          )}
          {isShareMode ? (
            "shareMode"
          ) : (
            <DatabaseSelect databases={databaseList} defaultValue={database} />
          )}
        </div>
        <Separator className="my-2" />
        <div className="flex  h-full flex-col justify-between">
          {loading ? (
            <TableListLoading />
          ) : (
            <div>
              {!isShareMode && (
                <Button
                  variant={"ghost"}
                  size="sm"
                  className="w-full justify-start font-normal"
                  asChild
                >
                  <Link href={`/${database}/everyday`}>
                    <CalendarDays className="pr-2" />
                    Everyday
                  </Link>
                </Button>
              )}

              <CurrentItemTree
                title="Tables"
                spaceName={database}
                allNodes={allNodes.filter((node) => node.type === "table")}
                isShareMode={isShareMode}
                Icon={<Database className="pr-2" />}
                currentNode={currentNode}
              />
              <CurrentItemTree
                title="Documents"
                spaceName={database}
                allNodes={allNodes.filter((node) => node.type === "doc")}
                isShareMode={isShareMode}
                currentNode={currentNode}
                Icon={<Files className="pr-2" />}
              />
            </div>
          )}
          <CreateFileDialog />
        </div>
      </div>
    </>
  )
}
