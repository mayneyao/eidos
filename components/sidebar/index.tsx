"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { File, FileSpreadsheet } from "lucide-react"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"
import { useCurrentNode } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useAllDatabases } from "@/hooks/use-database"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"
import { Separator } from "@/components/ui/separator"
import { DatabaseSelect } from "@/components/database-select"

import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { CreateFileDialog } from "./create-file"
import { TableListLoading } from "./loading"
import { TableItem } from "./table-menu"

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
  const { database, tableName: tableName } = useCurrentPathInfo()
  const currentNode = useCurrentNode()
  const [loading, setLoading] = useState(true)
  const { queryAllTables } = useSqlite(database)
  const {
    setSelectedTable,
    allNodes,
    setAllNodes: setAllTables,
  } = useSqliteStore()
  const databaseList = useAllDatabases()
  const { isShareMode } = useAppRuntimeStore()
  const { isSidebarOpen, setSidebarOpen } = useAppRuntimeStore()

  const handleClickTable = (table: string) => {
    setSidebarOpen(false)
    setSelectedTable(table)
  }
  useEffect(() => {
    console.log("side bar loading all tables ")
    queryAllTables().then((tables) => {
      tables && setAllTables(tables)
      setLoading(false)
    })
  }, [queryAllTables, setAllTables])
  const searchParams = useSearchParams()

  const databaseHomeLink = `/${database}`

  return (
    <>
      <div className={cn("flex h-full flex-col p-4", className)}>
        <div className="flex items-center justify-between">
          {!isShareMode && (
            <h2 className="relative px-6 text-lg font-semibold tracking-tight">
              <Link href={databaseHomeLink}>Tables</Link>
            </h2>
          )}
          {isShareMode ? (
            "shareMode"
          ) : (
            <DatabaseSelect databases={databaseList} defaultValue={database} />
          )}
        </div>
        <Separator className="my-2" />
        <ScrollArea className="grow px-2">
          <div className="space-y-1 p-2">
            {loading ? (
              <TableListLoading />
            ) : (
              allNodes?.map((node, i) => {
                const link = isShareMode
                  ? `/share/${database}/${node.id}?` + searchParams.toString()
                  : `/${database}/${node.id}`
                return (
                  <TableItem
                    tableName={node.name}
                    databaseName={database}
                    tableId={node.id}
                    key={node.id}
                  >
                    <Button
                      variant={
                        node.id === currentNode?.id ? "secondary" : "ghost"
                      }
                      size="sm"
                      onClick={() => handleClickTable(node.id)}
                      className="w-full justify-start font-normal"
                      asChild
                    >
                      <Link href={link}>
                        <ItemIcon type={node.type} className="pr-2" />
                        {node.name}
                      </Link>
                    </Button>
                  </TableItem>
                )
              })
            )}
          </div>
        </ScrollArea>
        <CreateFileDialog />
      </div>
    </>
  )
}
