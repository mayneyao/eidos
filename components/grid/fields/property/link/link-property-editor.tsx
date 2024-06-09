import { useState } from "react"
import { ChevronsUpDown } from "lucide-react"

import { ILinkProperty } from "@/lib/fields/link"
import { IField } from "@/lib/store/interface"
import { generateColumnName } from "@/lib/utils"
import { useAllNodes } from "@/hooks/use-nodes"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface IFieldPropertyEditorProps {
  uiColumn: IField<ILinkProperty>
  onPropertyChange: (property: ILinkProperty) => void
  onSave?: () => void
  isCreateNew?: boolean
}

export const LinkPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const allNodes = useAllNodes()
  const allTables = allNodes.filter((node) => node.type === "table")
  const [open, setOpen] = useState(false)

  const [linkTable, setLinkTable] = useState<string>(
    props.uiColumn.property.linkTableName ?? ""
  )
  const handleUpdateLinkTable = (tableName: string) => {
    setLinkTable(tableName)
    setOpen(false)
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
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-[200px] justify-between"
            >
              {linkTable
                ? allTables.find((table) => `tb_${table.id}` === linkTable)
                    ?.name || "Untitled"
                : "Select table..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="click-outside-ignore w-[200px] p-0">
            <Command>
              <CommandInput placeholder="Table" />
              <CommandEmpty>No table found.</CommandEmpty>
              <CommandGroup>
                <CommandList>
                  {allTables.map((table, index) => {
                    return (
                      <CommandItem
                        value={`${table.name} ${index}`}
                        key={table.id}
                        onSelect={() => handleUpdateLinkTable(`tb_${table.id}`)}
                      >
                        {table.name || "Untitled"}
                      </CommandItem>
                    )
                  })}
                </CommandList>
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {props.isCreateNew && <Button onClick={props.onSave}>Save</Button>}
    </div>
  )
}
