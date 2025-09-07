import { useEffect, useRef, useState } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, X } from "lucide-react"

import { PropertyIcon } from "./property-icon"
import { formatPropertyValue, inferType, isPropertyEmpty } from "./utils"

interface PropertyItemProps {
  propertyName: string
  value: any
  onUpdate: (propertyName: string, value: any) => Promise<void>
  onDelete: (propertyName: string) => Promise<void>
  autoEdit?: boolean
  onEditEnd?: () => void
  readonly?: boolean
  isSystemProperty?: boolean
  isDragDisabled?: boolean
}

export const PropertyItem: React.FC<PropertyItemProps> = ({
  propertyName,
  value,
  onUpdate,
  onDelete,
  autoEdit = false,
  onEditEnd,
  readonly = false,
  isSystemProperty = false,
  isDragDisabled = false,
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editingValue, setEditingValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const [itemRef, setItemRef] = useState<HTMLDivElement | null>(null)

  const propertyType = inferType(value, propertyName)
  const displayValue = formatPropertyValue(value, propertyType)
  const isEmpty = isPropertyEmpty(value)

  // Sortable functionality
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: propertyName,
    disabled: isDragDisabled || isEditing,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])

  // Auto-edit effect when autoEdit prop is true (but not in readonly mode or system property)
  useEffect(() => {
    if (autoEdit && !isEditing && !readonly && !isSystemProperty) {
      startEditing()
    }
  }, [autoEdit, readonly, isSystemProperty])

  const startEditing = () => {
    setIsEditing(true)
    setEditingValue(String(value || ""))
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditingValue("")
    onEditEnd?.()
  }

  const handleUpdate = async () => {
    await onUpdate(propertyName, editingValue)
    setIsEditing(false)
    setEditingValue("")
    onEditEnd?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleUpdate()
    } else if (e.key === "Escape") {
      cancelEditing()
    }
  }

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        setItemRef(node)
      }}
      style={style}
      className={`group relative flex items-center py-1 px-2 -mx-2 rounded border transition-colors border-transparent hover:border-border hover:bg-muted/50 focus:border-border focus:bg-muted/50 focus:outline-none ${
        isDragging ? "z-50" : ""
      }`}
      tabIndex={0}
      data-property-item
      data-property-name={propertyName}
    >
      {/* Drag Handle - 绝对定位在左侧，不占用布局空间 */}
      {!isDragDisabled && (
        <div
          {...attributes}
          {...listeners}
          className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing transition-opacity"
          title="Drag to reorder"
        >
          <GripVertical className="w-3 h-3" />
        </div>
      )}

      {/* Property Name */}
      <div className="flex items-center gap-2 w-40 flex-shrink-0">
        <span className="text-muted-foreground">
          <PropertyIcon type={propertyType} />
        </span>
        <span className="text-sm text-foreground truncate">{propertyName}</span>
      </div>

      {/* Property Value */}
      <div className="flex-1 min-w-0">
        <div className="relative h-6 flex items-center">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleUpdate}
              className="absolute inset-0 w-full px-2 text-sm border-none rounded focus:outline-none bg-muted focus:bg-accent"
              placeholder="Enter value..."
            />
          ) : (
            <div
              onClick={(e) => {
                if (!readonly && !isSystemProperty) {
                  e.stopPropagation()
                  startEditing()
                }
              }}
              className={`absolute inset-0 px-2 text-sm flex items-center ${
                readonly || isSystemProperty
                  ? "cursor-default"
                  : "cursor-pointer"
              }`}
            >
              {isEmpty ? (
                <span className="text-muted-foreground italic">Empty</span>
              ) : (
                <span className="text-foreground truncate">{displayValue}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* System Property Indicator */}
      {isSystemProperty && (
        <span className="ml-2 px-1 py-0.5 text-[10px] text-muted-foreground bg-muted rounded">
          SYSTEM
        </span>
      )}

      {/* Delete Button - 在非只读模式下显示，始终在最右边 */}
      {!readonly && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(propertyName)
          }}
          className="opacity-0 group-hover:opacity-100 ml-2 p-1 text-muted-foreground hover:text-destructive transition-opacity"
          title={isSystemProperty ? "Hide system property" : "Delete property"}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
