import { useContext, useEffect, useState } from "react"
import { Settings } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

import SqlEditor from "../sql-editor"
import { TableContext } from "./hooks"
import { ViewCreateTable } from "./view-create-table"

export const ViewRawQuery = () => {
  const [rawQuery, setRawQuery] = useState("")
  const { space, tableName } = useContext(TableContext)
  const { sqlite } = useSqlite()

  useEffect(() => {
    const fetchRawQuery = async () => {
      if (!sqlite) return
      try {
        const rawQuery = await sqlite.dataView.getViewRawQuery(tableName)
        // lazy import format
        const { format } = await import("sql-formatter")
        const formattedQuery = format(rawQuery, { language: "sqlite" })
        setRawQuery(formattedQuery)
      } catch (error) {
        console.error("Error loading sql-formatter or formatting query:", error)
        // Fallback to unformatted query if formatter fails
        if (sqlite) {
          try {
            const rawQuery = await sqlite.dataView.getViewRawQuery(tableName)
            setRawQuery(rawQuery)
          } catch (fallbackError) {
            console.error("Error fetching raw query:", fallbackError)
            setRawQuery("Error loading query")
          }
        }
      }
    }
    fetchRawQuery()
  }, [sqlite, tableName])

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="xs" variant="ghost">
          <Settings className="h-4 w-4 opacity-60"></Settings>
        </Button>
      </DialogTrigger>
      <DialogContent className="p-0 md:max-w-[756px] m-0 flex flex-col h-[70vh] overflow-hidden">
        <div className="flex justify-between items-center px-4 py-2 border-b">
          <span className="text-sm font-medium opacity-60">SQL Raw Query</span>
        </div>
        <div className="flex-1 min-h-0">
          <SqlEditor value={rawQuery} readOnly />
        </div>
        <div className="flex justify-end p-2 border-t">
          <ViewCreateTable />
        </div>
      </DialogContent>
    </Dialog>
  )
}
