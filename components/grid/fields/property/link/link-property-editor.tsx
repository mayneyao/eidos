import { useState } from "react"

import { ILinkProperty } from "@/lib/fields/link"
import { IField } from "@/lib/store/interface"
import { generateColumnName } from "@/lib/utils"
import { useAllNodes } from "@/hooks/use-nodes"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface IFieldPropertyEditorProps {
  uiColumn: IField<ILinkProperty>
  onPropertyChange: (property: ILinkProperty) => void
  onSave?: () => void
  isCreateNew?: boolean
}

export const LinkPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const allNodes = useAllNodes()
  const allTables = allNodes.filter((node) => node.type === "table")

  const [linkTable, setLinkTable] = useState<string>(
    props.uiColumn.property.linkTableName ?? ""
  )
  const handleUpdateLinkTable = (tableName: string) => {
    setLinkTable(tableName)
    props.onPropertyChange({
      linkTableName: tableName,
      linkColumnName:
        props.uiColumn.property.linkColumnName || generateColumnName(),
    })
  }
  if (!props.isCreateNew) return null

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex items-center justify-between">
        <Label>Table</Label>
        <Select value={linkTable} onValueChange={handleUpdateLinkTable}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Table" />
          </SelectTrigger>
          <SelectContent className="click-outside-ignore">
            {allTables.map((table) => {
              return (
                <SelectItem value={`tb_${table.id}`} key={table.id}>
                  {table.name || "Untitled"}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>
      {props.isCreateNew && <Button onClick={props.onSave}>Save</Button>}
    </div>
  )
}
