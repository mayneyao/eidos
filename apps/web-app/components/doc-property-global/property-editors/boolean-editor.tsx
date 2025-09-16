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
  const handleToggle = (checked: boolean) => {
    if (!readonly && !isSystemProperty) {
      let newValue: boolean | number = checked
      newValue = checked ? 1 : 0
      onChange(newValue)
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
