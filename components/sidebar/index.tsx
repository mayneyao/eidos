'use client'

import { DatabaseSelect } from "@/components/database-select";
import { useAllDatabases, useSqlite } from "@/lib/sql";
import { useSqliteStore } from "@/lib/store";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { TableItem } from "./table-menu";
import { TableListLoading } from "./loading";
import { Separator } from "@/components/ui/separator"
import { CreateTableDialog } from "./create-table";

export const SideBar = () => {
  const params = useParams();
  const { database, table: tableName } = params

  const [loading, setLoading] = useState(true);
  const { createTable, queryAllTables, sqlite } = useSqlite(database);
  const { selectedTable, setSelectedTable, allTables, setAllTables } = useSqliteStore();
  const databaseList = useAllDatabases()

  const router = useRouter();
  useEffect(() => {
    if (sqlite) {
      setTimeout(() => {
        queryAllTables().then(tables => {
          setAllTables(tables)
          setLoading(false)
        })
      }, 100);
    }
  }, [queryAllTables, setAllTables, sqlite])

  return <div className="flex h-screen flex-col p-4">
    <div className="flex items-center justify-between">
      <h2 className="relative px-6 text-lg font-semibold tracking-tight">
        Tables
      </h2>
      <DatabaseSelect databases={databaseList} defaultValue={database} />
    </div>
    <Separator className="my-2" />
    <ScrollArea className="grow px-2">
      <div className="space-y-1 p-2">
        {loading ? <TableListLoading /> : allTables?.map((table, i) => (
          <TableItem tableName={table} databaseName={database} key={`${table}`}>
            <Button
              variant={tableName === table ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSelectedTable(table)}
              className="w-full justify-start font-normal"
              asChild
            >
              <Link href={`/${database}/${table}`}>
                {table}
              </Link>
            </Button>
          </TableItem>
        ))}
      </div>
    </ScrollArea>
    <CreateTableDialog />
  </div>
}