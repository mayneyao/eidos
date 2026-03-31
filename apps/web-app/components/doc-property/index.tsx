import { useCallback, useEffect, useMemo, useRef } from "react"

import { getRawTableNameById, nonNullable } from "@/lib/utils"
import { FieldType } from "@/packages/core/fields/const"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"
import { cn } from "@/lib/utils"

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

const isTableSystemColumn = (uiColumn: any): boolean => {
  if (TABLE_SYSTEM_FIELD_TYPES.includes(uiColumn.type)) {
    return true
  }
  if (TABLE_SYSTEM_COLUMNS.includes(uiColumn.table_column_name)) {
    return true
  }
  return false
}

interface IDocPropertyProps {
  docId: string
  tableId: string
}

const icons = makeHeaderIcons(16)

interface FieldItemProps {
  uiColumn: any
  iconSvgString: string
  name: string
  value: any
  onUpdate: (key: string, value: any) => void
  isSystemColumn?: boolean
  onEditEnd?: () => void
}

const FieldItem: React.FC<FieldItemProps> = ({
  uiColumn,
  iconSvgString,
  name,
  value,
  onUpdate,
  isSystemColumn = false,
  onEditEnd,
}) => {
  const cellEditorRef = useRef<CellEditorRef>(null)

  const handleCellEditorChange = (newValue: any) => {
    if (newValue !== value) {
      onUpdate(uiColumn.table_column_name, newValue)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey && !isSystemColumn) {
      event.preventDefault()
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

  const isFileField = uiColumn.type === FieldType.File

  return (
    <div
      className={cn(
        "group relative flex items-start px-2 -mx-2 rounded transition-colors",
        "border border-transparent hover:border-border hover:bg-muted/50",
        "focus:border-border focus:bg-muted/50 focus:outline-hidden",
        "py-1"
      )}
      tabIndex={0}
      data-property-item
      data-property-name={name}
      onKeyDown={handleKeyDown}
    >
      {/* Property Name */}
      <div className="flex items-center gap-2 w-40 flex-shrink-0 h-6">
        <span
          className="text-muted-foreground w-4 h-4 flex items-center justify-center flex-shrink-0"
          dangerouslySetInnerHTML={{ __html: iconSvgString }}
        />
        <span className="text-sm text-muted-foreground truncate">{name}</span>
      </div>

      {/* Property Value - natural height with displayMode */}
      <div className="flex-1 min-w-0">
        <div
          data-cell-editor
          className={cn(
            "min-h-[24px] py-[2px]",
            !isFileField && !isSystemColumn && "cursor-text",
            isFileField &&
              (isSystemColumn ? "cursor-default" : "cursor-pointer")
          )}
          onClick={isFileField ? handleCellEditorClick : undefined}
        >
          <CellEditor
            ref={cellEditorRef}
            field={uiColumn}
            value={value}
            onChange={handleCellEditorChange}
            disabled={isSystemColumn}
            inline={uiColumn.type !== FieldType.MultiSelect}
            onFinishEditing={onEditEnd}
            multiline={true}
            displayMode={true}
            layout="flow"
          />
        </div>
      </div>

      {/* System Property Indicator */}
      {isSystemColumn && (
        <span className="ml-2 px-1 py-0.5 text-[10px] text-muted-foreground bg-muted rounded flex-shrink-0 mt-0.5">
          SYSTEM
        </span>
      )}
    </div>
  )
}

export const DocProperty = (props: IDocPropertyProps) => {
  const { params } = useRouterAdapter()
  const { space } = params
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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const container = containerRef.current
      if (!container) return

      if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) return

      if (!container.contains(document.activeElement)) return

      const currentFocused = document.activeElement as HTMLElement

      const propertyItems = container.querySelectorAll(
        "[data-property-item]"
      ) as NodeListOf<HTMLElement>
      const currentIndex = Array.from(propertyItems).indexOf(currentFocused)

      if (propertyItems.length === 0) {
        return
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          if (currentIndex < propertyItems.length - 1) {
            propertyItems[currentIndex + 1].focus()
          } else {
            container.blur()
            window.dispatchEvent(new CustomEvent("eidos-editor-focus"))
          }
          break
        case "ArrowUp":
          e.preventDefault()
          if (currentIndex > 0) {
            propertyItems[currentIndex - 1].focus()
          } else if (currentIndex === 0) {
            propertyItems[0].focus()
          }
          break
        case "Enter":
          e.preventDefault()
          if (currentIndex >= 0) {
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

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown])

  useEffect(() => {
    const handlePropertyActivate = () => {
      const container = containerRef.current
      if (!container) return

      const propertyItems = container.querySelectorAll(
        "[data-property-item]"
      ) as NodeListOf<HTMLElement>
      const lastItem = propertyItems[propertyItems.length - 1]
      if (lastItem) {
        lastItem.focus()
      } else {
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
    <div ref={containerRef} className="focus:outline-hidden" tabIndex={0}>
      <div className="space-y-0.5">
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
