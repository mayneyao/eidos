import { useContext, useState, useEffect } from "react"
import { Database } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

import { TableContext } from "./hooks"

export const ViewCreateTable = ({
  viewNodeId: propViewNodeId,
}: {
  viewNodeId?: string
}) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [newTableName, setNewTableName] = useState("")
  const [titleColumn, setTitleColumn] = useState<string>("")
  const [columns, setColumns] = useState<any[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const { tableName } = useContext(TableContext)
  const { sqlite } = useSqlite()
  const router = useRouterAdapter()

  const viewNodeId = propViewNodeId || tableName?.replace("vw_", "")

  useEffect(() => {
    if (isOpen && sqlite && viewNodeId) {
      const fetchColumns = async () => {
        try {
          const fields = await sqlite.dataView.getViewFields(viewNodeId)
          setColumns(fields)
          // Try to find a good default for title
          const titleField =
            fields.find(
              (f: any) =>
                f.table_column_name.toLowerCase() === "title" ||
                f.name.toLowerCase() === "title"
            ) ||
            fields.find(
              (f: any) =>
                f.name.toLowerCase() === "name" ||
                f.table_column_name.toLowerCase() === "name"
            )
          if (titleField) {
            setTitleColumn(titleField.table_column_name)
          }
        } catch (error) {
          console.error("Error fetching view fields:", error)
        }
      }
      fetchColumns()
    }
  }, [isOpen, sqlite, viewNodeId])

  const handleCreate = async () => {
    if (!sqlite || !newTableName.trim()) return
    setIsCreating(true)
    try {
      if (!viewNodeId) throw new Error("viewNodeId is required")
      const tableId = await sqlite.dataView.createTableFromDataView(
        viewNodeId,
        newTableName,
        titleColumn
      )
      toast.success(t("common.success"))
      setIsOpen(false)
      // Navigate to the new table
      router.navigate(`/${tableId}`)
    } catch (error) {
      console.error("Error creating table from view:", error)
      toast.error(t("common.error"))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="xs" variant="outline" className="gap-1 px-2 h-7">
          <Database className="h-3 w-3 opacity-60 ml-1" />
          <span className="hidden sm:inline">
            {t("dataview.createTableFromResults")}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dataview.createTableFromResults")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div
            className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-md leading-relaxed border"
            dangerouslySetInnerHTML={{
              __html: t("dataview.createTableDescription"),
            }}
          />
          <div className="space-y-2">
            <Label>{t("common.name")}</Label>
            <Input
              placeholder={t("common.name")}
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              disabled={isCreating}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreate()
                }
              }}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>{t("dataview.mapToTitle")}</Label>
            <Select value={titleColumn} onValueChange={setTitleColumn}>
              <SelectTrigger>
                <SelectValue placeholder={t("common.select")} />
              </SelectTrigger>
              <SelectContent>
                {columns.map((col) => (
                  <SelectItem
                    key={col.table_column_name}
                    value={col.table_column_name}
                  >
                    {col.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleCreate}
            disabled={isCreating || !newTableName.trim()}
          >
            {isCreating ? t("common.loading") : t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
