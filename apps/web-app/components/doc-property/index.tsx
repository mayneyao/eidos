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
 * 检查字段是否为表格系统字段
 */
const isTableSystemColumn = (uiColumn: any): boolean => {
  // 通过字段类型检查
  if (TABLE_SYSTEM_FIELD_TYPES.includes(uiColumn.type)) {
    return true
  }
  // 通过列名检查
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
      // 触发 CellEditor 的编辑状态
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

  // 键盘导航处理
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const container = containerRef.current
      if (!container) return

      // 只处理特定的键盘事件，让 Tab 键使用浏览器原生行为
      if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) return

      // 检查焦点是否在属性面板内
      if (!container.contains(document.activeElement)) return

      const currentFocused = document.activeElement as HTMLElement

      // 获取所有可聚焦的属性项
      const propertyItems = container.querySelectorAll(
        "[data-property-item]"
      ) as NodeListOf<HTMLElement>
      const currentIndex = Array.from(propertyItems).indexOf(currentFocused)

      // 如果没有找到任何可聚焦的元素，直接返回
      if (propertyItems.length === 0) {
        return
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          if (currentIndex < propertyItems.length - 1) {
            propertyItems[currentIndex + 1].focus()
          } else {
            // 已经在最后一个可聚焦元素，跳转到编辑器
            container.blur()
            window.dispatchEvent(new CustomEvent("eidos-editor-focus"))
          }
          break
        case "ArrowUp":
          e.preventDefault()
          if (currentIndex > 0) {
            propertyItems[currentIndex - 1].focus()
          } else if (currentIndex === 0) {
            // 已经在第一个，保持焦点
            propertyItems[0].focus()
          }
          break
        case "Enter":
          e.preventDefault()
          if (currentIndex >= 0) {
            // 触发编辑模式
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

  // 添加键盘事件监听
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown])

  // 添加属性激活事件监听
  useEffect(() => {
    const handlePropertyActivate = () => {
      const container = containerRef.current
      if (!container) return

      // 聚焦到最后一个可聚焦元素
      const propertyItems = container.querySelectorAll(
        "[data-property-item]"
      ) as NodeListOf<HTMLElement>
      const lastItem = propertyItems[propertyItems.length - 1]
      if (lastItem) {
        lastItem.focus()
      } else {
        // 如果没有任何可聚焦元素，聚焦到容器
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

  // 编辑结束后重新聚焦到对应的属性项
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
