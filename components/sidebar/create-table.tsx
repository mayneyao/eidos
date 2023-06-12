import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { useSqlite } from "@/hooks/use-sqlite"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { csvFile2Sql } from "./helper"

export function CreateTableDialog() {
  const [open, setOpen] = useState(false)
  const [tableName, setTableName] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const params = useParams()
  const router = useRouter()
  const { database } = params
  const { createTable, createTableWithSql } = useSqlite(database)

  const handleCreateTable = async () => {
    if (file) {
      const res = await csvFile2Sql(file, tableName.trim())
      await createTableWithSql(res.createTableSql, res.insertSql)
      // await createTableWithSql(res.createTableSql, res.insertSql)
      router.push(`/${database}/${tableName}`)
      setOpen(false)
    } else {
      await createTable(tableName)
      router.push(`/${database}/${tableName}`)
      setOpen(false)
    }
    setFile(null)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="w-full font-normal" variant="outline">
          <Plus size={16} className="mr-2" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Table</DialogTitle>
          <DialogDescription>
            {`give your table a name and click create when you're ready`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              *Name
            </Label>
            <Input
              id="name"
              placeholder="e.g. books"
              className="col-span-3"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Import
            </Label>
            <Input
              id="username"
              className="col-span-3"
              type="file"
              accept=".csv"
              onChange={(e) => {
                if (e.target.files) {
                  setFile(e.target.files[0])
                }
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleCreateTable}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
