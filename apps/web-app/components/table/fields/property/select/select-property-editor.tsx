import React, { useCallback, useMemo, useState } from "react"
import { SelectField } from "@/packages/core/fields/select"
import type { IField } from "@/packages/core/types/IField"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { Plus, Tags } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

import { SelectOption } from "./select-option"

interface IFieldPropertyEditorProps {
  uiColumn: IField
  onPropertyChange: (property: any) => void
  isCreateNew?: boolean
}

export const SelectPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const { t } = useTranslation()
  const { uiColumn, onPropertyChange } = props
  const field = useMemo(() => new SelectField(uiColumn), [uiColumn])
  const { sqlite } = useSqlite()
  const [newOptionName, setNewOptionName] = React.useState("")
  const [isAddNewOption, setIsAddNewOption] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  // Local state for immediate UI updates during drag
  const [localOptions, setLocalOptions] = useState(field.options)

  // Sync local state when field options change
  React.useEffect(() => {
    setLocalOptions(field.options)
  }, [field.options])

  const handleOptionNameChange = useCallback(
    (optionId: string, name: string) => {
      const oldOptionName = field.options.find((o) => o.id === optionId)?.name
      if (oldOptionName == name) {
        return
      }
      field.changeOptionName(optionId, name)
      onPropertyChange(field.column.property)
      if (sqlite) {
        sqlite.updateSelectOptionName(field.column, {
          from: oldOptionName!,
          to: name,
        })
      }
    },
    [field, onPropertyChange, sqlite]
  )

  const handleOptionColorChange = useCallback(
    (optionId: string, color: string) => {
      field.changeOptionColor(optionId, color)
      onPropertyChange(field.column.property)
    },
    [field, onPropertyChange]
  )

  const handleOptionDelete = useCallback(
    (optionId: string) => {
      field.deleteOption(optionId)
      onPropertyChange(field.column.property)
      if (sqlite) {
        sqlite.deleteSelectOption(field.column, optionId)
      }
    },
    [field, onPropertyChange, sqlite]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = localOptions.findIndex((item) => item.id === active.id)
      const newIndex = localOptions.findIndex((item) => item.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOptions = arrayMove(localOptions, oldIndex, newIndex)
        setLocalOptions(newOptions)
        field.column.property.options = newOptions
        onPropertyChange(field.column.property)
      }
    },
    [localOptions, field, onPropertyChange]
  )

  const handleAddNewOption = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        const isExist = field.options.find((o) => o.name === newOptionName)
        if (isExist || !newOptionName.trim()) {
          return
        }
        field.addOption(newOptionName.trim())
        setNewOptionName("")
        onPropertyChange(field.column.property)
        setIsAddNewOption(false)
      }
    },
    [field, newOptionName, onPropertyChange]
  )

  const handleNewOptionChange: React.ChangeEventHandler<HTMLInputElement> = (
    e
  ) => {
    setNewOptionName(e.target.value)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2" ref={ref}>
      <Separator />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Tags className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-xs font-medium text-foreground">
            {t("table.propertyEditor.select.options")}
          </Label>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0 rounded-full">
            {localOptions.length}
          </span>
        </div>
        <Button
          onClick={() => setIsAddNewOption(!isAddNewOption)}
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[11px] gap-1"
        >
          <Plus className="h-3 w-3" />
          {t("table.propertyEditor.select.addOption")}
        </Button>
      </div>

      {/* Add New Option Input */}
      {isAddNewOption && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-150">
          <Input
            autoFocus
            value={newOptionName}
            onChange={handleNewOptionChange}
            onKeyDown={handleAddNewOption}
            onBlur={() => {
              if (!newOptionName.trim()) {
                setIsAddNewOption(false)
              }
            }}
            placeholder={t("table.propertyEditor.select.optionPlaceholder")}
            className="h-7 text-xs"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            {t("table.propertyEditor.select.pressEnterToAdd")}
          </p>
        </div>
      )}

      <div
        className={cn(
          "w-full rounded-md border bg-muted/30 flex-1 min-h-0 flex flex-col overflow-hidden"
        )}
      >
        <ScrollArea className="flex-1 w-full">
          <div className="p-1.5">
            {localOptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <Tags className="h-4 w-4 text-muted-foreground/50 mb-1" />
                <p className="text-xs text-muted-foreground">
                  {t("table.propertyEditor.select.noOptions")}
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                  {t("table.propertyEditor.select.addFirstOption")}
                </p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={localOptions.map((opt) => opt.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-0.5">
                    {localOptions.map((option) => (
                      <SelectOption
                        key={option.id}
                        option={option}
                        container={ref.current}
                        onColorChange={handleOptionColorChange}
                        onNameChange={handleOptionNameChange}
                        onDelete={handleOptionDelete}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
