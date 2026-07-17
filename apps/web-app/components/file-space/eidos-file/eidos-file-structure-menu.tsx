import type {
  EidosFileFieldInfo,
  EidosFileTableInfo,
} from "@eidos.space/eidos-file"
import {
  Columns3,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  SlidersHorizontal,
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

interface EidosFileStructureMenuProps {
  table: EidosFileTableInfo
  fields: EidosFileFieldInfo[]
  disabled?: boolean
  onNewField: () => void
  onRenameTable: () => void
  onDeleteTable: () => void
  onRevealEidosFile: () => void
  onEditField: (field: EidosFileFieldInfo) => void
  onDeleteField: (field: EidosFileFieldInfo) => void
}

export function EidosFileStructureMenu({
  table,
  fields,
  disabled = false,
  onNewField,
  onRenameTable,
  onDeleteTable,
  onRevealEidosFile,
  onEditField,
  onDeleteField,
}: EidosFileStructureMenuProps) {
  const visibleFields = fields.filter((field) => !field.isHidden)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={`Eidos File actions for ${table.name}`}
          title="Eidos File actions"
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
                    <DropdownMenuItem onSelect={() => onEditField(field)}>
                      <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
                      Edit property
                    </DropdownMenuItem>
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRevealEidosFile}>
          <FolderOpen className="mr-2 h-3.5 w-3.5" />
          Show Eidos File in file manager
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
