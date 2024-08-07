import { Plus } from "lucide-react"
import React, { useCallback, useMemo } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useSqlite } from "@/hooks/use-sqlite"
import { SelectField } from "@/lib/fields/select"
import { IField } from "@/lib/store/interface"

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

  return {
    handleOptionNameChange,
    handleOptionColorChange,
    handleOptionDelete,
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

  return (
    <ScrollArea className="max-h-[500px] grow-0" ref={ref}>
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
      <div className="mt-2 flex flex-col items-start overflow-y-auto">
        {isAddNewOption && (
          <Input
            autoFocus
            value={newOptionName}
            onChange={handleNewOptionChange}
            onKeyDown={handleAddNewOption}
            onBlur={() => setIsAddNewOption(false)}
          />
        )}
        {field.options.map((option) => {
          return (
            <SelectOption
              key={option.id}
              option={option}
              container={ref.current}
              onColorChange={handleOptionColorChange}
              onNameChange={handleOptionNameChange}
              onDelete={handleOptionDelete}
            />
          )
        })}
      </div>
    </ScrollArea>
  )
}
