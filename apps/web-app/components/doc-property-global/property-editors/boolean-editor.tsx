import React from "react"

import { Checkbox } from "@/apps/web-app/components/ui/checkbox"

import { BaseEditor } from "./base-editor"
import type { PropertyEditorProps } from "./types"

/**
 * Boolean property editor component
 * Always shows a checkbox - no separate edit mode needed
 */
export const BooleanEditor: React.FC<PropertyEditorProps> = ({
  value,
  onChange,
  readonly = false,
  isSystemProperty = false,
}) => {
  // Determine if we should store as number (0/1) or boolean (true/false)
  // If the current value is a number, maintain that format
  const shouldStoreAsNumber = typeof value === "number"

  console.log("value", value)
  const handleToggle = (checked: boolean) => {
    if (!readonly && !isSystemProperty) {
      let newValue: boolean | number = checked
      if (shouldStoreAsNumber) {
        newValue = checked ? 1 : 0
      } else {
        newValue = checked
      }
      onChange(newValue)
      console.log("newValue", newValue)
    }
  }

  // Convert value to boolean for display
  const isChecked = Boolean(value)

  return (
    <BaseEditor readonly={readonly} isSystemProperty={isSystemProperty}>
      <Checkbox
        checked={isChecked}
        onCheckedChange={handleToggle}
        disabled={readonly || isSystemProperty}
        className="h-4 w-4"
      />
    </BaseEditor>
  )
}
