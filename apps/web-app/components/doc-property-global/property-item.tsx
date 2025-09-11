import { useEffect, useState } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, X } from "lucide-react"

import { PropertyEditorFactory } from "./property-editors"
import { PropertyIcon } from "./property-icon"
import { PropertyMenu } from "./property-menu"
import { useDocPropertyTypes } from "./property-type-hook"
import type { PropertyType } from "./types"
import {
  convertFieldTypeToPropertyType,
  inferType,
  isPropertyEmpty,
} from "./utils"

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
  allowTypeChange?: boolean
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
  allowTypeChange = false,
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [itemRef, setItemRef] = useState<HTMLDivElement | null>(null)

  // Use the global property types hook for type inference
  const { getPropertyType, propertyTypeMap } = useDocPropertyTypes()

  // Get the actual property type from the database schema, fallback to inference
  const actualFieldType = getPropertyType(propertyName)
  const inferredType = inferType(value, propertyName)

  // Convert FieldType to PropertyType for display compatibility
  const propertyType = actualFieldType
    ? convertFieldTypeToPropertyType(actualFieldType)
    : inferredType
  const isEmpty = isPropertyEmpty(value)

  console.log({
    propertyName,
    propertyType,
    actualFieldType,
    inferredType,
    value,
    isEmpty,
    propertyTypeMap,
  })
  // Handle clicking on property icon to show menu
  const handleIconClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu(!showMenu)
  }

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

  // Auto-edit effect when autoEdit prop is true (but not in readonly mode or system property)
  useEffect(() => {
    if (
      autoEdit &&
      !isEditing &&
      !readonly &&
      !isSystemProperty &&
      propertyType !== "boolean"
    ) {
      setIsEditing(true)
    }
  }, [autoEdit, readonly, isSystemProperty, propertyType, isEditing])

  const handleStartEdit = () => {
    if (!readonly && !isSystemProperty && propertyType !== "boolean") {
      setIsEditing(true)
    }
  }

  const handleFinishEdit = () => {
    setIsEditing(false)
    onEditEnd?.()
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    onEditEnd?.()
  }

  const handleValueChange = async (newValue: any) => {
    await onUpdate(propertyName, newValue)
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
      {/* Property Menu - 移到根元素，避免 hover 抖动 */}
      {showMenu && (
        <div className="absolute left-4 top-1 z-50">
          <PropertyMenu
            propertyName={propertyName}
            value={value}
            isSystemProperty={isSystemProperty}
            readonly={readonly}
            allowTypeChange={allowTypeChange}
            onClose={() => setShowMenu(false)}
            onDelete={onDelete}
          />
        </div>
      )}
      {/* Property Name */}
      <div className="flex items-center gap-2 w-40 flex-shrink-0 relative h-6">
        <div className="relative">
          {/* Property Icon - 默认显示，hover 时隐藏 */}
          {!isDragDisabled && (
            <button
              onClick={handleIconClick}
              className="group-hover:hidden text-muted-foreground hover:text-foreground transition-colors p-1 -m-1 rounded hover:bg-muted/50"
              title="Property options"
            >
              <PropertyIcon type={propertyType as PropertyType} />
            </button>
          )}

          {/* Drag Handle - 默认隐藏，hover 时显示 */}
          {!isDragDisabled && (
            <button
              {...attributes}
              {...listeners}
              onClick={handleIconClick}
              className="hidden group-hover:block text-muted-foreground hover:text-foreground transition-colors p-1 -m-1 rounded hover:bg-muted/50 cursor-grab active:cursor-grabbing"
              title="Drag to reorder / Click for options"
            >
              <GripVertical className="w-3 h-3" />
            </button>
          )}

          {/* Property Icon - 当 drag disabled 时总是显示 */}
          {isDragDisabled && (
            <button
              onClick={handleIconClick}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 -m-1 rounded hover:bg-muted/50"
              title="Property options"
            >
              <PropertyIcon type={propertyType as PropertyType} />
            </button>
          )}
        </div>
        <span className="text-sm text-foreground truncate">{propertyName}</span>
      </div>

      {/* Property Value */}
      <div className="flex-1 min-w-0">
        <div className="relative h-6 flex items-center">
          <PropertyEditorFactory
            propertyType={propertyType as PropertyType}
            value={value}
            onChange={handleValueChange}
            isEditing={isEditing}
            onFinishEdit={handleFinishEdit}
            onCancelEdit={handleCancelEdit}
            onStartEdit={handleStartEdit}
            autoFocus={true}
            readonly={readonly}
            isSystemProperty={isSystemProperty}
            isEmpty={isEmpty}
            propertyName={propertyName}
          />
        </div>
      </div>

      {/* System Property Indicator */}
      {isSystemProperty && (
        <span className="ml-2 px-1 py-0.5 text-[10px] text-muted-foreground bg-muted rounded">
          SYSTEM
        </span>
      )}

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
