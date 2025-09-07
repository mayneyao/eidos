import React, { useCallback, useMemo } from "react"
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
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

import { SelectOption } from "./select-option"

interface IFieldPropertyEditorProps {
  uiColumn: IField
  onPropertyChange: (property: any) => void
  isCreateNew?: boolean
}

const useFieldChange = (
  field: SelectField,
  onPropertyChange: (property: any) => void
) => {
  const { sqlite } = useSqlite()

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

  const handleOptionsReorder = useCallback(
    (oldIndex: number, newIndex: number) => {
      const newOptions = [...field.options]
      const [movedOption] = newOptions.splice(oldIndex, 1)
      newOptions.splice(newIndex, 0, movedOption)

      field.column.property.options = newOptions
      onPropertyChange(field.column.property)
    },
    [field, onPropertyChange]
  )

  return {
    handleOptionNameChange,
    handleOptionColorChange,
    handleOptionDelete,
    handleOptionsReorder,
  }
}

export const SelectPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const { uiColumn, onPropertyChange } = props
  const field = useMemo(() => new SelectField(uiColumn), [uiColumn])
  const [newOptionName, setNewOptionName] = React.useState("")
  const [isAddNewOption, setIsAddNewOption] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const {
    handleOptionNameChange,
    handleOptionColorChange,
    handleOptionDelete,
    handleOptionsReorder,
  } = useFieldChange(field, onPropertyChange)

  const handleAddNewOption = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        const isExist = field.options.find((o) => o.name === newOptionName)
        if (isExist) {
          return
        }
        field.addOption(newOptionName)
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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over) return

      if (active.id !== over.id) {
        const oldIndex = field.options.findIndex(
          (item) => item.id === active.id
        )
        const newIndex = field.options.findIndex((item) => item.id === over.id)
        handleOptionsReorder(oldIndex, newIndex)
      }
    },
    [field.options, handleOptionsReorder]
  )

  return (
    <ScrollArea
      className="max-h-[500px] grow-0 w-full overflow-x-hidden"
      ref={ref}
    >
      <div className="flex flex-col w-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Options
            </div>
          </div>
          <Button
            onClick={() => setIsAddNewOption(!isAddNewOption)}
            variant="ghost"
            size="sm"
            className="flex items-center gap-1"
          >
            <Plus size={16} />
            <span>Add Option</span>
          </Button>
        </div>
        <hr />
        <div className="mt-2 flex flex-col items-start w-full">
          {isAddNewOption && (
            <Input
              autoFocus
              value={newOptionName}
              onChange={handleNewOptionChange}
              onKeyDown={handleAddNewOption}
              onBlur={() => setIsAddNewOption(false)}
              className="w-full"
            />
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={field.options.map((opt) => opt.id)}
              strategy={verticalListSortingStrategy}
            >
              {field.options.map((option) => (
                <SelectOption
                  key={option.id}
                  option={option}
                  container={ref.current}
                  onColorChange={handleOptionColorChange}
                  onNameChange={handleOptionNameChange}
                  onDelete={handleOptionDelete}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </ScrollArea>
  )
}
