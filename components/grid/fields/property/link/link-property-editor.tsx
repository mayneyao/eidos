import { useState } from "react"

import { Button } from "@/components/ui/button"
import { useAllNodes } from "@/hooks/use-nodes"
import { IField } from "@/lib/store/interface"

interface IFieldPropertyEditorProps {
  uiColumn: IField
  onPropertyChange: (property: any) => void
  onSave?: () => void
  isCreateNew?: boolean
}

export const LinkPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const allNodes = useAllNodes()
  const allTables = allNodes.filter((node) => node.type === "table")

  const [linkTable, setLinkTable] = useState<string>(
    props.uiColumn.property.linkTable ?? ""
  )
  const handleUpdateLinkTable = (tableName: string) => {
    setLinkTable(tableName)
    props.onPropertyChange({
      linkTable: tableName,
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
            <option value={`tb_${table.id}`} key={table.id}>
              {table.name || "Untitled"}
            </option>
          )
        })}
      </select>
      {props.isCreateNew && <Button onClick={props.onSave}>Save</Button>}
    </div>
  )
}
