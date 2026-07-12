import type { BaseFieldInfo, BaseTableInfo } from "@eidos.space/base"
import {
  Columns3,
  Calculator,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface BaseStructureMenuProps {
  table: BaseTableInfo
  fields: BaseFieldInfo[]
  disabled?: boolean
  onNewField: () => void
  onRenameTable: () => void
  onDeleteTable: () => void
  onRenameField: (field: BaseFieldInfo) => void
  onEditFieldOptions: (field: BaseFieldInfo) => void
  onEditFormula: (field: BaseFieldInfo) => void
  onDeleteField: (field: BaseFieldInfo) => void
}

export function BaseStructureMenu({
  table,
  fields,
  disabled = false,
  onNewField,
  onRenameTable,
  onDeleteTable,
  onRenameField,
  onEditFieldOptions,
  onEditFormula,
  onDeleteField,
}: BaseStructureMenuProps) {
  const visibleFields = fields.filter((field) => !field.isHidden)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={`Manage ${table.name}`}
          title="Table and fields"
          disabled={disabled}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onNewField}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          New field
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRenameTable}>
          <Pencil className="mr-2 h-3.5 w-3.5" />
          Rename table
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={onDeleteTable}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Delete table
        </DropdownMenuItem>
        {visibleFields.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Fields
            </DropdownMenuLabel>
            {visibleFields.map((field) => {
              const canDelete = field.valueKind !== "system"
              return (
                <DropdownMenuSub key={field.tableColumnName}>
                  <DropdownMenuSubTrigger>
                    <Columns3 className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{field.name}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-40">
                    <DropdownMenuItem onSelect={() => onRenameField(field)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Rename
                    </DropdownMenuItem>
                    {field.type === "select" ||
                    field.type === "multi-select" ? (
                      <DropdownMenuItem
                        onSelect={() => onEditFieldOptions(field)}
                      >
                        <ListPlus className="mr-2 h-3.5 w-3.5" />
                        Edit options
                      </DropdownMenuItem>
                    ) : null}
                    {field.type === "formula" ? (
                      <DropdownMenuItem onSelect={() => onEditFormula(field)}>
                        <Calculator className="mr-2 h-3.5 w-3.5" />
                        Edit formula
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      disabled={!canDelete}
                      className="text-destructive focus:text-destructive"
                      onSelect={() => onDeleteField(field)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )
            })}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
