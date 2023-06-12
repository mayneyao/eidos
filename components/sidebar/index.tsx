"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"

import { DatabaseSelect } from "@/components/database-select"
import { Separator } from "@/components/ui/separator"
import { useAllDatabases } from "@/hooks/use-database"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"

import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { CreateTableDialog } from "./create-table"
import { TableListLoading } from "./loading"
import { TableItem } from "./table-menu"

export const SideBar = () => {
  const { database, table: tableName } = useParams()
  const [loading, setLoading] = useState(true)
  const { queryAllTables } = useSqlite(database)
  const { setSelectedTable, allTables, setAllTables } = useSqliteStore()
  const databaseList = useAllDatabases()

  useEffect(() => {
    console.log("side bar loading all tables, database: ")
    setTimeout(() => {
      queryAllTables().then((tables) => {
        tables && setAllTables(tables)
        setLoading(false)
      })
    }, 100)
  }, [queryAllTables, setAllTables])

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-center justify-between">
        <h2 className="relative px-6 text-lg font-semibold tracking-tight">
          <Link href={`/${database}`}>Tables</Link>
        </h2>
        <DatabaseSelect databases={databaseList} defaultValue={database} />
      </div>
      <Separator className="my-2" />
      <ScrollArea className="grow px-2">
        <div className="space-y-1 p-2">
          {loading ? (
            <TableListLoading />
          ) : (
            allTables?.map((table, i) => (
              <TableItem
                tableName={table}
                databaseName={database}
                key={`${table}`}
              >
                <Button
                  variant={tableName === table ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setSelectedTable(table)}
                  className="w-full justify-start font-normal"
                  asChild
                >
                  <Link href={`/${database}/${table}`}>{table}</Link>
                </Button>
              </TableItem>
            ))
          )}
        </div>
      </ScrollArea>
      <CreateTableDialog />
    </div>
  )
}
