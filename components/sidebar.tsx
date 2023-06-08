'use client'

import { useAllTables, useSqlite } from "@/lib/sql"
import { useSqliteStore } from "@/lib/store"
import { Button } from "./ui/button"
import { ScrollArea } from "./ui/scroll-area"

export const SideBar = () => {
  const allTables = useAllTables();
  const { createTable } = useSqlite();
  const { selectedTable, setSelectedTable } = useSqliteStore();
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
    <ScrollArea className="h-[300px] px-2">

      <div className="space-y-1 p-2">
        <Button size="sm" className="w-full font-normal" variant="outline" onClick={createNewTable}>
          <span className="text-xs font-semibold">+</span>
        </Button>
        {allTables?.map((table, i) => (
          <Button
            key={`${table}`}
            variant="ghost"
            size="sm"
            onClick={() => setSelectedTable(table)}
            className="w-full justify-start font-normal"
          >
            {table}
          </Button>
        ))}
      </div>
    </ScrollArea>
  </div>
}