"use client"

import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

import { DatabaseSelect } from "@/components/database-select"
import { Separator } from "@/components/ui/separator"
import { useAllDatabases } from "@/hooks/use-database"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"

import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { CreateTableDialog } from "./create-table"
import { TableListLoading } from "./loading"
import { TableItem } from "./table-menu"

export const SideBar = ({ className }: any) => {
  const { database, table: tableName } = useParams()
  const [loading, setLoading] = useState(true)
  const { queryAllTables } = useSqlite(database)
  const { setSelectedTable, allTables, setAllTables } = useSqliteStore()
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
            allTables?.map((table, i) => {
              const link = isShareMode
                ? `/share/${database}/${table}?` + searchParams.toString()
                : `/${database}/${table}`
              return (
                <TableItem
                  tableName={table}
                  databaseName={database}
                  key={table}
                >
                  <Button
                    variant={tableName === table ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => handleClickTable(table)}
                    className="w-full justify-start font-normal"
                    asChild
                  >
                    <Link href={link}>{table}</Link>
                  </Button>
                </TableItem>
              )
            })
          )}
        </div>
      </ScrollArea>
      <CreateTableDialog />
    </div>
  )
}
