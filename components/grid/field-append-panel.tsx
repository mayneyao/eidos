"use client"

import * as React from "react"

import { Button } from "../ui/button"
import { useTableAppStore } from "./store"

const FieldTypeSelect = () => {
  const { selectedFieldType, setSelectedFieldType } = useTableAppStore()
  const fieldTypes = [
    { name: "Text", value: "text" },
    { name: "Number", value: "number" },
    { name: "Select", value: "select" },
    { name: "Multi-Select", value: "multi-select" },
    { name: "Checkbox", value: "checkbox" },
  ]

  return (
    <div>
      <h2 className="relative px-6 text-lg font-semibold tracking-tight">
        Select a field type
      </h2>
      <div className="space-y-1 p-2">
        {fieldTypes.map((field, i) => (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start font-normal"
            key={`${field.value}`}
            onClick={() => setSelectedFieldType(field.value)}
          >
            {field.name}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function FieldAppendPanel() {
  const { selectedFieldType, setSelectedFieldType } = useTableAppStore()

  return (
    <div>
      {selectedFieldType ? <div>{selectedFieldType}</div> : <FieldTypeSelect />}
    </div>
  )
}
