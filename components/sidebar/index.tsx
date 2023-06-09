'use client'

import { DatabaseSelect } from "@/components/database-select";
import { useAllDatabases, useSqlite } from "@/lib/sql";
import { useSqliteStore } from "@/lib/store";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { TableItem } from "./table-menu";
import { TableListLoading } from "./loading";
import { Separator } from "@/components/ui/separator"
import { Plus } from "lucide-react";

interface ISideBarProps {
  database: string;
}
export const SideBar = ({ database }: ISideBarProps) => {

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

  const createNewTable = async () => {
    const tableName = prompt("Table name");
    if (tableName) {
      await createTable(tableName);
      setSelectedTable(tableName);
      router.push(`/${database}/${tableName}`)
    }
  }

  return <div className="flex h-screen flex-col p-4">
    <div className="flex items-center justify-between">
      <h2 className="relative px-6 text-lg font-semibold tracking-tight">
        Tables
      </h2>
      <div className="mr-4">
        <DatabaseSelect databases={databaseList} defaultValue={database} />
      </div>
    </div>
    <Separator className="my-2" />
    <ScrollArea className="grow px-2">
      <div className="space-y-1 p-2">
        {loading ? <TableListLoading /> : allTables?.map((table, i) => (
          <TableItem tableName={table} databaseName={database} key={`${table}`}>
            <Button
              variant="ghost"
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
    <Button size="sm" className="w-full font-normal" variant="outline" onClick={createNewTable}>
      <Plus size={16} className="mr-2" />
    </Button>
  </div>
}