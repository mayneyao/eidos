import { LexicalEditor } from "lexical"
import { useMemo } from "react"

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command"
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
    <Command>
      <CommandInput placeholder="search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {tableNodes.map((table) => {
          return (
            <CommandItem key={table.id} onSelect={() => handleQuery(table.id)}>
              {table.name || "Untitled"}
            </CommandItem>
          )
        })}
      </CommandList>
    </Command>
  )
}
