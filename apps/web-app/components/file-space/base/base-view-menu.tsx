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

import {
  baseFieldDisplayName,
  isOptionalBaseSystemField,
} from "./base-field-visibility"

export function BaseViewMenu({
  fields,
  hiddenFields,
  visibleSystemFields,
  disabled,
  onVisibilityChange,
}: {
  fields: BaseFieldInfo[]
  hiddenFields: string[]
  visibleSystemFields: string[]
  disabled?: boolean
  onVisibilityChange: (visibility: {
    hiddenFields: string[]
    visibleSystemFields: string[]
  }) => void
}) {
  const hidden = new Set(hiddenFields)
  const visibleSystem = new Set(visibleSystemFields)
  const regularFields = fields.filter(
    (field) => !isOptionalBaseSystemField(field)
  )
  const systemFields = fields.filter(isOptionalBaseSystemField)
  const toggle = (field: BaseFieldInfo, visible: boolean) => {
    if (isOptionalBaseSystemField(field)) {
      const next = new Set(visibleSystem)
      if (visible) next.add(field.tableColumnName)
      else next.delete(field.tableColumnName)
      onVisibilityChange({
        hiddenFields,
        visibleSystemFields: [...next],
      })
      return
    }
    const next = new Set(hidden)
    if (visible) next.delete(field.tableColumnName)
    else next.add(field.tableColumnName)
    onVisibilityChange({
      hiddenFields: [...next],
      visibleSystemFields,
    })
  }

  const fieldItem = (field: BaseFieldInfo, system = false) => (
    <DropdownMenuCheckboxItem
      key={field.tableColumnName}
      disabled={!system && field.tableColumnName === "title"}
      checked={
        system
          ? visibleSystem.has(field.tableColumnName)
          : !hidden.has(field.tableColumnName)
      }
      onSelect={(event) => event.preventDefault()}
      onCheckedChange={(checked) => toggle(field, checked === true)}
    >
      <span className="truncate">{baseFieldDisplayName(field)}</span>
    </DropdownMenuCheckboxItem>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="base-workbar-action h-7 gap-1 px-2 text-xs"
          aria-label="Choose visible Base fields"
          title="Fields"
          disabled={disabled}
        >
          <Columns3 className="h-3.5 w-3.5" />
          <span className="base-workbar-action-label">Fields</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-medium">
          Visible fields
        </DropdownMenuLabel>
        {regularFields.map((field) => fieldItem(field))}
        {systemFields.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              System fields
            </DropdownMenuLabel>
            {systemFields.map((field) => fieldItem(field, true))}
          </>
        ) : null}
        {hiddenFields.length > 0 || visibleSystemFields.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() =>
                onVisibilityChange({
                  hiddenFields: [],
                  visibleSystemFields: [],
                })
              }
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset field visibility
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
