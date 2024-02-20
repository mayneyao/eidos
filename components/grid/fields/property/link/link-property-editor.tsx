import { useState } from "react"

import { ILinkProperty } from "@/lib/fields/link"
import { IField } from "@/lib/store/interface"
import { generateColumnName } from "@/lib/utils"
import { useAllNodes } from "@/hooks/use-nodes"
import { Button } from "@/components/ui/button"

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
