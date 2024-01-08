import { LexicalEditor } from "lexical"
import { useMemo } from "react"

import { useAllNodes } from "@/hooks/use-nodes"

import { INSERT_DATABASE_TABLE_COMMAND } from "."

interface DialogProps {
  activeEditor: LexicalEditor
  onClose: () => void
}

export const SelectDatabaseTableDialog = (props: DialogProps) => {
  const { activeEditor, onClose } = props
  const allNodes = useAllNodes()
  const tableNodes = useMemo(
    () => allNodes.filter((node) => node.type === "table"),
    [allNodes]
  )

  const handleQuery = (id: string) => {
    activeEditor.dispatchCommand(INSERT_DATABASE_TABLE_COMMAND, id)
    onClose()
  }

  return (
    <ul className="flex flex-col gap-2">
      {tableNodes.map((table) => {
        return (
          <li
            key={table.id}
            className="cursor-pointer rounded-md px-2 py-1 hover:bg-secondary"
            onClick={() => handleQuery(table.id)}
          >
            {table.name || "Untitled"}
          </li>
        )
      })}
    </ul>
  )
}
