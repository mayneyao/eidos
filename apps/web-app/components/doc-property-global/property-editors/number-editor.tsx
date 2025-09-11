import React, { useEffect, useRef, useState } from "react"
import { BaseEditor, EmptyValue } from "./base-editor"
import type { PropertyEditorProps } from "./types"
import { isPropertyEmpty } from "../utils"

/**
 * Number property editor component
 * Handles numeric input with validation
 */
export const NumberEditor: React.FC<PropertyEditorProps> = ({
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
}) => {
  const [editingValue, setEditingValue] = useState<string>("")
  const inputRef = useRef<HTMLInputElement>(null)
  
  const isEmpty = propIsEmpty ?? isPropertyEmpty(value)
  
  // Update editing value when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setEditingValue(value !== null && value !== undefined ? String(value) : "")
    }
  }, [isEditing, value])

  // Auto focus when editing starts
  useEffect(() => {
    if (isEditing && autoFocus && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing, autoFocus])

  const parseNumber = (str: string): number | null => {
    if (str.trim() === "") return null
    const num = Number(str)
    return isNaN(num) ? null : num
  }

  const handleFinishEdit = () => {
    const numValue = parseNumber(editingValue)
    onChange(numValue)
    onFinishEdit?.()
  }

  const handleCancelEdit = () => {
    setEditingValue(value !== null && value !== undefined ? String(value) : "")
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value
    // Allow empty string, numbers, decimal points, and negative sign
    if (inputValue === "" || /^-?\d*\.?\d*$/.test(inputValue)) {
      setEditingValue(inputValue)
    }
  }

  if (isEditing) {
    return (
      <BaseEditor readonly={readonly} isSystemProperty={isSystemProperty} isEditing={isEditing}>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={editingValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleFinishEdit}
          className="w-full bg-transparent border-none outline-none focus:outline-none"
          placeholder="Enter number..."
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
        {typeof value === "number" ? value.toLocaleString() : String(value)}
      </span>
    </BaseEditor>
  )
}
