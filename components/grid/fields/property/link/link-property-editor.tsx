import { useState } from "react"

import { useSqliteStore } from "@/hooks/use-sqlite"
import { IUIColumn } from "@/hooks/use-table"
import { Button } from "@/components/ui/button"

interface IFieldPropertyEditorProps {
  uiColumn: IUIColumn
  onPropertyChange: (property: any) => void
  onSave?: () => void
  isCreateNew?: boolean
}

export const LinkPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const { allNodes } = useSqliteStore()
  const allTables = allNodes.filter((node) => node.type === "table")

  const [linkTable, setLinkTable] = useState<string>(
    props.uiColumn.property.linkTable ?? ""
  )
  const handleUpdateLinkTable = (tableId: string) => {
    setLinkTable(tableId)
    props.onPropertyChange({
      linkTable: `tb_${tableId}`,
    })
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      <select
        name=""
        id=""
        value={linkTable}
        onChange={(e) => handleUpdateLinkTable(e.target.value)}
      >
        <option value="">Select a table</option>
        {allTables.map((table) => {
          return (
            <option value={table.id} key={table.id}>
              {table.name}
            </option>
          )
        })}
      </select>
      {props.isCreateNew && <Button onClick={props.onSave}>Save</Button>}
    </div>
  )
}
