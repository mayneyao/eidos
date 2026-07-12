import type { BaseFieldInfo } from "@eidos.space/base"
import { Columns3, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function BaseViewMenu({
  fields,
  hiddenFields,
  disabled,
  onHiddenFieldsChange,
}: {
  fields: BaseFieldInfo[]
  hiddenFields: string[]
  disabled?: boolean
  onHiddenFieldsChange: (hiddenFields: string[]) => void
}) {
  const hidden = new Set(hiddenFields)
  const toggle = (field: BaseFieldInfo, visible: boolean) => {
    const next = new Set(hidden)
    if (visible) next.delete(field.tableColumnName)
    else next.add(field.tableColumnName)
    onHiddenFieldsChange([...next])
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          disabled={disabled}
        >
          <Columns3 className="h-3.5 w-3.5" />
          Fields
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-medium">
          Visible fields
        </DropdownMenuLabel>
        {fields.map((field) => (
          <DropdownMenuCheckboxItem
            key={field.tableColumnName}
            checked={!hidden.has(field.tableColumnName)}
            disabled={field.tableColumnName === "title"}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => toggle(field, checked === true)}
          >
            <span className="truncate">{field.name}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {hiddenFields.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onHiddenFieldsChange([])}>
              <RotateCcw className="h-3.5 w-3.5" />
              Show all fields
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
