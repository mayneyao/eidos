"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

import { useAllDatabases } from "@/hooks/use-database"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"
import { Separator } from "@/components/ui/separator"
import { DatabaseSelect } from "@/components/database-select"

import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { CreateTableDialog } from "./create-table"
import { TableListLoading } from "./loading"
import { TableItem } from "./table-menu"

export const SideBar = () => {
  const params = useParams()
  const { database, table: tableName } = params

  const [loading, setLoading] = useState(true)
  const { createTable, queryAllTables } = useSqlite(database)
  const { selectedTable, setSelectedTable, allTables, setAllTables } =
    useSqliteStore()
  const databaseList = useAllDatabases()

  const router = useRouter()
  useEffect(() => {
    setTimeout(() => {
      queryAllTables().then((tables) => {
        setAllTables(tables)
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
