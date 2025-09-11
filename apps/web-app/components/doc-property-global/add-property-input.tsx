import { useEffect, useRef, useState } from "react"
import { Type } from "lucide-react"

interface AddPropertyInputProps {
  onAdd: (propertyName: string) => Promise<void>
  onCancel: () => void
  initialValue?: string
}

export const AddPropertyInput: React.FC<AddPropertyInputProps> = ({
  onAdd,
  onCancel,
  initialValue = "",
}) => {
  const [newPropertyName, setNewPropertyName] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      // 如果有初始值，选中所有文本
      if (initialValue) {
        inputRef.current.select()
      }
    }
  }, [])

  const handleAdd = async () => {
    if (!newPropertyName.trim()) return
    await onAdd(newPropertyName.trim())
    setNewPropertyName("")
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
    <div className="flex items-center py-1">
      <div className="flex items-center gap-2 w-40 flex-shrink-0">
        <span className="text-muted-foreground">
          <Type className="w-3 h-3" />
        </span>
        <div className="flex-1 relative h-6 flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={newPropertyName}
            onChange={(e) => setNewPropertyName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="absolute inset-0 w-full px-2 text-sm border-none rounded focus:outline-none bg-muted focus:bg-accent"
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
  )
}
