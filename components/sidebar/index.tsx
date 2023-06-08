'use client'

import { useSqlite } from "@/lib/sql"
import { useSqliteStore } from "@/lib/store"
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { TableItem } from "./table-menu";
import { useEffect } from "react";


export const SideBar = () => {
  const { createTable, queryAllTables, sqlite } = useSqlite();
  const { selectedTable, setSelectedTable, allTables, setAllTables } = useSqliteStore();

  useEffect(() => {
    if (sqlite) {
      setTimeout(() => {
        queryAllTables().then(tables => {
          setAllTables(tables)
        })
      }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sqlite])

  const createNewTable = async () => {
    const tableName = prompt("Table name");
    if (tableName) {
      await createTable(tableName);
      setSelectedTable(tableName);
    }
  }

  return <div className="p-4">
    <h2 className="relative px-6 text-lg font-semibold tracking-tight">
      Tables
    </h2>
    <ScrollArea className="h-[500px] px-2">
      <div className="space-y-1 p-2">
        <Button size="sm" className="w-full font-normal" variant="outline" onClick={createNewTable}>
          <span className="text-xs font-semibold">+</span>
        </Button>
        {allTables?.map((table, i) => (
          <TableItem tableName={table} key={`${table}`}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedTable(table)}
              className="w-full justify-start font-normal"
            >
              {table}
            </Button>
          </TableItem>
        ))}
      </div>
    </ScrollArea>
  </div>
}