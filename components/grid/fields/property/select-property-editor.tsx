import React, { useCallback, useMemo } from "react"
import { Plus } from "lucide-react"

import { DefaultOptColors, SelectField } from "@/lib/fields/select"
import { IUIColumn } from "@/hooks/use-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface IFieldPropertyEditorProps {
  uiColumn: IUIColumn
  onPropertyChange: (property: any) => void
}

export const SelectPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const { uiColumn, onPropertyChange } = props
  const field = useMemo(() => new SelectField(uiColumn), [uiColumn])

  const [newOptionName, setNewOptionName] = React.useState("")
  const [options, setOptions] = React.useState(
    field.column.property?.options ?? []
  )

  const handleAddNewOption = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        const isExist = options.find((o) => o.tag === newOptionName)
        if (isExist) {
          return
        }
        const randomColor =
          DefaultOptColors[Math.floor(Math.random() * DefaultOptColors.length)]
        const newOptions = [
          ...options,
          { tag: newOptionName, color: `#${randomColor}` },
        ]
        setOptions(newOptions)
        setNewOptionName("")
        const newProperty = {
          // ...field.column.property ?? {},
          options: newOptions,
        }
        console.log({ newProperty })
        onPropertyChange(newProperty)
      }
    },
    [newOptionName, onPropertyChange, options]
  )
  const handleNewOptionChange: React.ChangeEventHandler<HTMLInputElement> = (
    e
  ) => {
    setNewOptionName(e.target.value)
  }

  return (
    <div>
      options
      <div className="p-2">
        <Button variant="ghost" className="w-full">
          <Plus />
        </Button>
        <Input
          value={newOptionName}
          onChange={handleNewOptionChange}
          onKeyDown={handleAddNewOption}
        />
        {options.map((option) => {
          return (
            <div>
              <span className="px-[6px]" style={{ background: option.color }}>
                {option.tag}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
