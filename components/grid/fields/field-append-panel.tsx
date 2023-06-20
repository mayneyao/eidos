"use client"

import * as React from "react"
import { useClickAway } from "ahooks"
import {
  BaselineIcon,
  CalendarDaysIcon,
  CheckSquareIcon,
  ImageIcon,
  LinkIcon,
  StarIcon,
  TagIcon,
  TagsIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { IUIColumn } from "@/hooks/use-table"
import { Button } from "@/components/ui/button"

import { useTableAppStore } from "../store"

export function FieldAppendPanel({
  addField,
  uiColumns,
}: {
  addField: (fieldName: string, fieldType: string) => Promise<void>
  uiColumns: IUIColumn[]
}) {
  const [selectedFieldType, setSelectedFieldType] = React.useState<string>()
  const ref = React.useRef<HTMLDivElement>(null)
  const { isAddFieldEditorOpen, setIsAddFieldEditorOpen } = useTableAppStore()
  const fieldTypes = [
    { name: "Text", value: "text", icon: BaselineIcon },
    { name: "Number", value: "number", icon: BaselineIcon },
    { name: "Select", value: "select", icon: TagIcon },
    { name: "MultiSelect", value: "multi-select", icon: TagsIcon },
    {
      name: "Checkbox",
      value: "checkbox",
      icon: CheckSquareIcon,
    },
    { name: "Rating", value: "rating", icon: StarIcon },
    { name: "URL", value: "url", icon: LinkIcon },
    { name: "Date", value: "date", icon: CalendarDaysIcon },
    { name: "Files", value: "file", icon: ImageIcon },
  ]

  const handleAddField = (field: (typeof fieldTypes)[0]) => {
    const newFieldName = `${field.name}${uiColumns.length + 1}`
    addField(newFieldName, field.value).then(() =>
      setIsAddFieldEditorOpen(false)
    )
    // setSelectedFieldType(field.name)
    // for now just close, not support edit field
  }

  useClickAway(
    () => {
      isAddFieldEditorOpen && setIsAddFieldEditorOpen(false)
    },
    ref,
    ["mousedown", "touchstart"]
  )

  return (
    <div
      ref={ref}
      className={cn(
        "absolute right-0 z-50 h-screen w-[400px] bg-white shadow-lg dark:bg-slate-950"
      )}
    >
      {selectedFieldType ? (
        <div>{selectedFieldType}</div>
      ) : (
        <div>
          <h2 className="relative px-6 text-lg font-semibold tracking-tight">
            add field
          </h2>
          <div className="space-y-1 p-2">
            {fieldTypes.map((field, i) => {
              const Icon = field.icon
              return (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start font-normal"
                  key={`${field.name}-${field.value}`}
                  onClick={(e) => {
                    handleAddField(field)
                  }}
                >
                  <Icon className="mr-2 h-5 w-5" />
                  {field.name}
                </Button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
