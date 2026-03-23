import React, { useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import { ExternalLink } from "lucide-react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"

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
  const { navigate } = useRouterAdapter()
  const { space: databaseId } = useCurrentPathInfo()

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

  // Handle date navigation
  const handleDateNavigation = () => {
    if (propertyType === "date" && value && databaseId) {
      try {
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          // Format date as YYYY-MM-DD for the URL
          const dateString = date.toISOString().split("T")[0]
          navigate(`/journals/${dateString}`)
        }
      } catch (error) {
        console.error("Invalid date value for navigation:", error)
      }
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
          className="w-auto min-w-0 bg-transparent border-none outline-hidden focus:outline-hidden"
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
      <div className="flex items-center gap-2 w-full">
        <span className="text-foreground truncate">
          {propertyType === "datetime"
            ? formatDateForDisplay(value, "yyyy-MM-dd HH:mm")
            : formatDateForDisplay(value, "yyyy-MM-dd")}
        </span>

        {/* Date Navigation Icon */}
        {propertyType === "date" &&
          value &&
          !isEmpty &&
          databaseId &&
          !isEditing && (
            <button
              onClick={handleDateNavigation}
              className="ml-2 p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              title="jump to the day"
            >
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
      </div>
    </BaseEditor>
  )
}
