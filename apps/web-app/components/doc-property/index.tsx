import { useCallback, useEffect, useMemo, useRef } from "react"
import { useParams } from "react-router-dom"

import { getRawTableNameById, nonNullable } from "@/lib/utils"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"

import { CellEditor, type CellEditorRef } from "../table/cell-editor"
import { makeHeaderIcons } from "../table/fields/header-icons"
import { useDocProperty } from "./hook"

const TABLE_SYSTEM_FIELD_TYPES = [
  "title",
  "created-time",
  "last-edited-time",
  "created-by",
  "last-edited-by",
] as const

const TABLE_SYSTEM_COLUMNS = [
  "_id",
  "title",
  "_created_time",
  "_last_edited_time",
  "_created_by",
  "_last_edited_by",
] as const

/**
 * Check if field is a table system field
 */
const isTableSystemColumn = (uiColumn: any): boolean => {
  // Check by field type
  if (TABLE_SYSTEM_FIELD_TYPES.includes(uiColumn.type)) {
    return true
  }
  // Check by column name
  if (TABLE_SYSTEM_COLUMNS.includes(uiColumn.table_column_name)) {
    return true
  }
  return false
}

interface IDocPropertyProps {
  docId: string
  tableId: string
}

interface FieldItemProps {
  uiColumn: any
  iconSvgString: string
  name: string
  value: any
  onUpdate: (key: string, value: any) => void
  isSystemColumn?: boolean
  onEditEnd?: () => void
}

const icons = makeHeaderIcons(16)

const FieldItem: React.FC<FieldItemProps> = ({
  uiColumn,
  iconSvgString,
  name,
  value,
  onUpdate,
  isSystemColumn = false,
  onEditEnd,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const cellEditorRef = useRef<CellEditorRef>(null)

  const handleCellEditorChange = (newValue: any) => {
    if (newValue !== value) {
      onUpdate(uiColumn.table_column_name, newValue)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !isSystemColumn) {
      event.preventDefault()
      // Trigger CellEditor's edit state
      if (cellEditorRef.current) {
        cellEditorRef.current.startEditing()
      }
    }
  }

  const handleCellEditorClick = () => {
    if (!isSystemColumn && cellEditorRef.current) {
      cellEditorRef.current.startEditing()
    }
  }

  return (
    <div
      ref={containerRef}
      className="group relative flex items-center py-1 px-2 -mx-2 rounded border transition-colors border-transparent hover:border-border hover:bg-muted/50 focus:border-border focus:bg-muted/50 focus:outline-none"
      tabIndex={0}
      data-property-item
      data-property-name={name}
      onKeyDown={handleKeyDown}
    >
      {/* Property Name */}
      <div className="flex items-center gap-2 w-40 flex-shrink-0">
        <span
          className="text-muted-foreground w-4 h-4 flex items-center justify-center"
          dangerouslySetInnerHTML={{ __html: iconSvgString }}
        />
        <span className="text-sm text-foreground truncate">{name}</span>
      </div>

      {/* Property Value */}
      <div className="flex-1 min-w-0">
        <div
          data-cell-editor
          onClick={handleCellEditorClick}
          className={isSystemColumn ? "cursor-default" : "cursor-pointer"}
        >
          <CellEditor
            ref={cellEditorRef}
            field={uiColumn}
            value={value}
            onChange={handleCellEditorChange}
            className="h-6 text-sm"
            disabled={isSystemColumn}
            inline={true}
            onFinishEditing={onEditEnd}
          />
        </div>
      </div>

      {/* System Property Indicator */}
      {isSystemColumn && (
        <span className="ml-2 px-1 py-0.5 text-[10px] text-muted-foreground bg-muted rounded">
          SYSTEM
        </span>
      )}
    </div>
  )
}

export const DocProperty = (props: IDocPropertyProps) => {
  const { space } = useParams()
  const { uiColumns } = useUiColumns(getRawTableNameById(props.tableId), space!)
  const { properties, setProperty } = useDocProperty({
    tableId: props.tableId,
    docId: props.docId,
  })
  const containerRef = useRef<HTMLDivElement>(null)

  const fields = useMemo(() => {
    if (!properties) return []
    return uiColumns
      .map((uiColumn: any) => {
        const name = uiColumn.name
        // error data
        if (!uiColumn) {
          return
        }
        if (uiColumn.table_column_name === "title") {
          return
        }
        const iconSvgString = icons[uiColumn.type]({
          bgColor: "#aaa",
          fgColor: "currentColor",
        })
        const value = properties[uiColumn.table_column_name]
        const isSystemColumn = isTableSystemColumn(uiColumn)
        return { uiColumn, iconSvgString, name, value, isSystemColumn }
      })
      .filter(nonNullable)
  }, [properties, uiColumns])

  // Keyboard navigation handling
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const container = containerRef.current
      if (!container) return

      // Only handle specific keyboard events, let Tab key use browser native behavior
      if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) return

      // Check if focus is within property panel
      if (!container.contains(document.activeElement)) return

      const currentFocused = document.activeElement as HTMLElement

      // Get all focusable property items
      const propertyItems = container.querySelectorAll(
        "[data-property-item]"
      ) as NodeListOf<HTMLElement>
      const currentIndex = Array.from(propertyItems).indexOf(currentFocused)

      // If no focusable elements found, return directly
      if (propertyItems.length === 0) {
        return
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          if (currentIndex < propertyItems.length - 1) {
            propertyItems[currentIndex + 1].focus()
          } else {
            // Already at the last focusable element, jump to editor
            container.blur()
            window.dispatchEvent(new CustomEvent("eidos-editor-focus"))
          }
          break
        case "ArrowUp":
          e.preventDefault()
          if (currentIndex > 0) {
            propertyItems[currentIndex - 1].focus()
          } else if (currentIndex === 0) {
            // Already at the first, keep focus
            propertyItems[0].focus()
          }
          break
        case "Enter":
          e.preventDefault()
          if (currentIndex >= 0) {
            // Trigger edit mode
            const currentElement = propertyItems[currentIndex]
            const cellEditor = currentElement.querySelector(
              "[data-cell-editor]"
            ) as HTMLElement
            if (cellEditor) {
              cellEditor.click()
            }
          }
          break
        case "Escape":
          e.preventDefault()
          container.blur()
          break
      }
    },
    [fields.length]
  )

  // Add keyboard event listener
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown])

  // Add property activation event listener
  useEffect(() => {
    const handlePropertyActivate = () => {
      const container = containerRef.current
      if (!container) return

      // Focus on the last focusable element
      const propertyItems = container.querySelectorAll(
        "[data-property-item]"
      ) as NodeListOf<HTMLElement>
      const lastItem = propertyItems[propertyItems.length - 1]
      if (lastItem) {
        lastItem.focus()
      } else {
        // If no focusable elements, focus on container
        container.focus()
      }
    }

    window.addEventListener("eidos-property-activate", handlePropertyActivate)
    return () => {
      window.removeEventListener(
        "eidos-property-activate",
        handlePropertyActivate
      )
    }
  }, [fields.length])

  const handlePropertyChange = (key: string, value: any) => {
    setProperty({
      [key]: value,
    })
  }

  // Re-focus on corresponding property item after editing ends
  const handleEditEnd = useCallback((propertyName: string) => {
    setTimeout(() => {
      const container = containerRef.current
      if (container) {
        const propertyItem = container.querySelector(
          `[data-property-name="${propertyName}"]`
        ) as HTMLElement
        if (propertyItem) {
          propertyItem.focus()
        }
      }
    }, 0)
  }, [])

  return (
    <div ref={containerRef} className="focus:outline-none" tabIndex={0}>
      <div className="space-y-1">
        {fields.map(
          ({ uiColumn, iconSvgString, name, value, isSystemColumn }) => (
            <FieldItem
              key={uiColumn.name}
              uiColumn={uiColumn}
              iconSvgString={iconSvgString}
              name={name}
              value={value}
              onUpdate={handlePropertyChange}
              isSystemColumn={isSystemColumn}
              onEditEnd={() => handleEditEnd(name)}
            />
          )
        )}
      </div>
    </div>
  )
}
