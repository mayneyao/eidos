import { useMemo, useRef } from "react"
import { useParams } from "react-router-dom"

import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"
import { getRawTableNameById, nonNullable } from "@/lib/utils"

import { CellEditor, type CellEditorRef } from "../table/cell-editor"
import { makeHeaderIcons } from "../table/fields/header-icons"
import { useDocProperty } from "./hook"

// 表格系统字段类型列表
const TABLE_SYSTEM_FIELD_TYPES = [
  "title",
  "created-time",
  "last-edited-time",
  "created-by",
  "last-edited-by",
] as const

// 表格系统字段列名列表
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
}

const icons = makeHeaderIcons(16)

const FieldItem: React.FC<FieldItemProps> = ({
  uiColumn,
  iconSvgString,
  name,
  value,
  onUpdate,
  isSystemColumn = false,
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
        <CellEditor
          ref={cellEditorRef}
          field={uiColumn}
          value={value}
          onChange={handleCellEditorChange}
          className="h-6 text-sm"
          disabled={isSystemColumn}
          inline={true}
        />
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

  const handlePropertyChange = (key: string, value: any) => {
    setProperty({
      [key]: value,
    })
  }

  return (
    <div className="focus:outline-none" tabIndex={0}>
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
            />
          )
        )}
      </div>
    </div>
  )
}
