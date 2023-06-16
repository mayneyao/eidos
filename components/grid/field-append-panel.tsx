"use client"

import * as React from "react"
import { GridCellKind } from "@glideapps/glide-data-grid"
import { useClickAway } from "ahooks"

import { cn } from "@/lib/utils"
import { IUIColumn } from "@/hooks/use-table"

import { Button } from "../ui/button"
import { useTableAppStore } from "./store"

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
    { name: "Text", value: GridCellKind.Text },
    { name: "Number", value: GridCellKind.Number },
    { name: "Select", value: GridCellKind.Bubble },
    { name: "MultiSelect", value: GridCellKind.Bubble },
    { name: "Checkbox", value: GridCellKind.Boolean },
    { name: "Files", value: GridCellKind.Image },
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
      className={cn("fixed right-0 z-50 h-screen w-[400px] bg-white shadow-lg")}
    >
      {selectedFieldType ? (
        <div>{selectedFieldType}</div>
      ) : (
        <div>
          <h2 className="relative px-6 text-lg font-semibold tracking-tight">
            add field
          </h2>
          <div className="space-y-1 p-2">
            {fieldTypes.map((field, i) => (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start font-normal"
                key={`${field.name}-${field.value}`}
                onClick={(e) => {
                  handleAddField(field)
                }}
              >
                {field.name}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
