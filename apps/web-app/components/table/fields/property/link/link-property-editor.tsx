import { useState, useEffect } from "react"
import type { ILinkProperty } from "@/packages/core/fields/link"
import type { IField } from "@/packages/core/types/IField"
import { Link2, Table2, ChevronsUpDown, Check } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn, generateColumnName } from "@/lib/utils"
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
import { Separator } from "@/components/ui/separator"
import { useAllNodes } from "@/apps/web-app/hooks/use-nodes"

interface IFieldPropertyEditorProps {
  uiColumn: IField<ILinkProperty>
  onPropertyChange: (property: ILinkProperty) => void
  onSave?: () => void
  isCreateNew?: boolean
  showSaveButton?: boolean
}

export const LinkPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const { t } = useTranslation()
  const allNodes = useAllNodes()
  const allTables = allNodes.filter((node) => node.type === "table")
  const [open, setOpen] = useState(false)

  const [linkTable, setLinkTable] = useState<string>(
    props.uiColumn.property.linkTableName ?? ""
  )

  // Sync with external changes
  useEffect(() => {
    setLinkTable(props.uiColumn.property.linkTableName ?? "")
  }, [props.uiColumn.property.linkTableName])

  const handleUpdateLinkTable = (tableName: string) => {
    setLinkTable(tableName)
    setOpen(false)
    props.onPropertyChange({
      linkTableName: tableName,
      linkColumnName:
        props.uiColumn.property.linkColumnName || generateColumnName(),
    })
    props.onSave?.()
  }

  if (!props.isCreateNew) return null

  const selectedTable = allTables.find(
    (table) => `tb_${table.id}` === linkTable
  )

  return (
    <div className="space-y-3">
      <Separator />

      {/* Header */}
      <div className="flex items-center gap-2">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">
          {t("table.propertyEditor.link.linkSettings")}
        </span>
      </div>

      {/* Table Selection */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-foreground">
          {t("table.propertyEditor.link.targetTable")}
        </Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between h-8 text-xs"
            >
              <div className="flex items-center gap-2">
                <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">
                  {selectedTable
                    ? selectedTable.name || t("common.untitled")
                    : t("table.propertyEditor.link.selectTable")}
                </span>
              </div>
              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="click-outside-ignore w-[240px] p-0">
            <Command>
              <CommandInput
                placeholder={t("table.propertyEditor.link.searchTable")}
                className="h-8 text-xs"
              />
              <CommandEmpty className="text-xs py-2">
                {t("table.propertyEditor.link.noTableFound")}
              </CommandEmpty>
              <CommandGroup>
                <CommandList className="max-h-[200px]">
                  {allTables.map((table, index) => (
                    <CommandItem
                      key={table.id}
                      value={`${table.name} ${index}`}
                      onSelect={() => handleUpdateLinkTable(`tb_${table.id}`)}
                      className="text-xs"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate">
                          {table.name || t("common.untitled")}
                        </span>
                      </div>
                      {linkTable === `tb_${table.id}` && (
                        <Check className="ml-auto h-3.5 w-3.5 text-primary" />
                      )}
                    </CommandItem>
                  ))}
                </CommandList>
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
        <p className="text-[10px] text-muted-foreground">
          {t("table.propertyEditor.link.linkDescription")}
        </p>
      </div>

      {/* Info Card */}
      {selectedTable && (
        <div
          className={cn(
            "flex items-start gap-1.5 rounded-md border p-2 text-[11px]",
            "bg-muted/50 border-border"
          )}
        >
          <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <span className="text-muted-foreground leading-relaxed">
            {t("table.propertyEditor.link.linkedTo", {
              tableName: selectedTable.name || t("common.untitled"),
            })}
          </span>
        </div>
      )}

      {/* Save Button */}
      {props.showSaveButton && (
        <Button onClick={props.onSave} className="h-7 text-xs w-full" size="sm">
          {t("common.save")}
        </Button>
      )}
    </div>
  )
}
