import React, { useEffect, useRef, useState } from "react"
import { format } from "date-fns"

import { isPropertyEmpty } from "../utils"
import { BaseEditor, EmptyValue } from "./base-editor"
import type { PropertyEditorProps } from "./types"

/**
 * Date property editor component
 * Handles date input with validation
 */
export const DateEditor: React.FC<PropertyEditorProps> = ({
  value,
  onChange,
  isEditing = false,
  onFinishEdit,
  onCancelEdit,
  onStartEdit,
  autoFocus = false,
  readonly = false,
  isSystemProperty = false,
  isEmpty: propIsEmpty,
  propertyType,
}) => {
  const [editingValue, setEditingValue] = useState<string>("")
  const inputRef = useRef<HTMLInputElement>(null)

  const isEmpty = propIsEmpty ?? isPropertyEmpty(value)

  // Convert value to date/datetime string for input
  const valueToDateString = (val: any): string => {
    if (!val) return ""

    try {
      const date = new Date(val)
      if (isNaN(date.getTime())) return ""

      if (propertyType === "datetime") {
        // Format as YYYY-MM-DDTHH:MM for datetime-local input
        // Use local timezone offset to avoid date shifting
        const offset = date.getTimezoneOffset() * 60000
        const localDate = new Date(date.getTime() - offset)
        return localDate.toISOString().slice(0, 16)
      } else {
        // Format as YYYY-MM-DD for date input
        // Use local timezone offset to avoid date shifting
        const offset = date.getTimezoneOffset() * 60000
        const localDate = new Date(date.getTime() - offset)
        return localDate.toISOString().split("T")[0]
      }
    } catch {
      return ""
    }
  }

  // Format date/datetime for display
  const formatDateForDisplay = (val: any, formatPattern?: string): string => {
    if (!val) return ""

    try {
      const date = new Date(val)
      if (isNaN(date.getTime())) return String(val)

      if (formatPattern) {
        return format(date, formatPattern)
      }

      if (propertyType === "datetime") {
        return date.toLocaleString() // Show both date and time
      } else {
        return date.toLocaleDateString() // Show only date
      }
    } catch {
      return String(val)
    }
  }

  // Update editing value when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setEditingValue(valueToDateString(value))
    }
  }, [isEditing, value])

  // Auto focus when editing starts
  useEffect(() => {
    if (isEditing && autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing, autoFocus])

  const handleFinishEdit = () => {
    if (editingValue.trim() === "") {
      onChange(null)
    } else {
      // Convert to appropriate format for storage
      const date = new Date(editingValue)
      if (!isNaN(date.getTime())) {
        if (propertyType === "datetime") {
          onChange(date.toISOString()) // Store full ISO datetime
        } else {
          onChange(date.toISOString().split("T")[0]) // Store as YYYY-MM-DD
        }
      } else {
        onChange(editingValue) // Store as-is if not a valid date
      }
    }
    onFinishEdit?.()
  }

  const handleCancelEdit = () => {
    setEditingValue(valueToDateString(value))
    onCancelEdit?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleFinishEdit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      handleCancelEdit()
    }
  }

  const handleStartEdit = () => {
    if (!readonly && !isSystemProperty) {
      onStartEdit?.()
    }
  }

  if (isEditing) {
    return (
      <BaseEditor
        readonly={readonly}
        isSystemProperty={isSystemProperty}
        isEditing={isEditing}
      >
        <input
          ref={inputRef}
          type={propertyType === "datetime" ? "datetime-local" : "date"}
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleFinishEdit}
          className="w-full bg-transparent border-none outline-none focus:outline-none"
        />
      </BaseEditor>
    )
  }

  if (isEmpty) {
    return (
      <EmptyValue
        onClick={handleStartEdit}
        readonly={readonly}
        isSystemProperty={isSystemProperty}
      />
    )
  }

  return (
    <BaseEditor
      onClick={handleStartEdit}
      readonly={readonly}
      isSystemProperty={isSystemProperty}
    >
      <span className="text-foreground truncate">
        {propertyType === "datetime"
          ? formatDateForDisplay(value, "yyyy-MM-dd HH:mm")
          : formatDateForDisplay(value, "yyyy-MM-dd")}
      </span>
    </BaseEditor>
  )
}
