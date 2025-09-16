import { useEffect, useRef, useState } from "react"
import { RESERVED_PROPERTIES } from "@/packages/core/meta-table/doc/helper"
import { validateSqliteColumnName } from "@/packages/lib/utils"
import { Type } from "lucide-react"

interface AddPropertyInputProps {
  onAdd: (propertyName: string) => Promise<void>
  onCancel: () => void
  initialValue?: string
  existingProperties?: string[]
}

export const AddPropertyInput: React.FC<AddPropertyInputProps> = ({
  onAdd,
  onCancel,
  initialValue = "",
  existingProperties = [],
}) => {
  const [newPropertyName, setNewPropertyName] = useState(initialValue)
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      if (initialValue) {
        inputRef.current.select()
      }
    }
  }, [])

  // Validate property name
  const validatePropertyName = (name: string) => {
    if (!name.trim()) {
      setValidationError(null)
      return true
    }

    const validation = validateSqliteColumnName(
      name.trim(),
      existingProperties,
      RESERVED_PROPERTIES
    )
    setValidationError(validation.error || null)
    return validation.isValid
  }

  // Handle input change with validation
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setNewPropertyName(value)
    validatePropertyName(value)
  }

  const handleAdd = async () => {
    if (!newPropertyName.trim()) return

    // Validate before adding
    if (!validatePropertyName(newPropertyName.trim())) {
      return
    }

    await onAdd(newPropertyName.trim())
    setNewPropertyName("")
    setValidationError(null)
  }

  const handleCancel = () => {
    setNewPropertyName("")
    onCancel()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAdd()
    } else if (e.key === "Escape") {
      handleCancel()
    }
  }

  const handleBlur = () => {
    if (newPropertyName.trim()) {
      handleAdd()
    } else {
      handleCancel()
    }
  }

  return (
    <div className="py-1">
      <div className="flex items-center">
        <div className="flex items-center gap-2 w-40 flex-shrink-0">
          <span className="text-muted-foreground">
            <Type className="w-3 h-3" />
          </span>
          <div className="flex-1 relative h-6 flex items-center">
            <input
              ref={inputRef}
              type="text"
              value={newPropertyName}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              className={`absolute inset-0 w-full px-2 text-sm border-none rounded focus:outline-none bg-muted focus:bg-accent ${
                validationError ? "border-red-500 focus:border-red-500" : ""
              }`}
              placeholder="Property name"
            />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative h-6 flex items-center">
            <div className="absolute inset-0 px-2 text-sm text-muted-foreground italic flex items-center">
              Empty
            </div>
          </div>
        </div>
      </div>
      {validationError && (
        <div className="mt-1 px-2 text-xs text-red-500">{validationError}</div>
      )}
    </div>
  )
}
