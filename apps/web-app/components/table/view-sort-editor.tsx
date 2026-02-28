import { useCallback, useContext, useEffect, useMemo, useState } from "react"
import { FieldType } from "@/packages/core/fields/const"
import type { OrderByItem } from "@/packages/core/sqlite/sql-sort-parser"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"

import { FieldSelector } from "./fields/field-selector"
import { TableContext, useCurrentView } from "./hooks"
import { useViewQuery } from "./hooks/use-view-query"
import { SortableContainer } from "./sortable"

interface IViewEditorProps {
  onSortChange?: (sort: OrderByItem[]) => void
}

interface SortableItemProps {
  item: OrderByItem & { id: string }
  index: number
  uiColumns: any[]
  onValueChange: (value: string, index: number) => void
  onOrderChange: (value: string, index: number) => void
  onDelete: (index: number) => void
  t: (key: string) => string
  excludeValues: string[]
}

// Helper function to get field type from uiColumns
function getFieldType(columnName: string, uiColumns: any[]): FieldType | null {
  const column = uiColumns.find((col) => col.table_column_name === columnName)
  return column?.type || null
}

// Helper function to get appropriate sorting text based on field type
function getSortingText(
  fieldType: FieldType | null,
  order: string,
  t: (key: string) => string
): string {
  if (!fieldType) {
    return order === "ASC"
      ? t("table.sortAscending")
      : t("table.sortDescending")
  }

  // Number types
  if (fieldType === FieldType.Number || fieldType === FieldType.Rating) {
    return order === "ASC"
      ? t("table.sort.number.asc")
      : t("table.sort.number.desc")
  }

  // Text types
  if (
    fieldType === FieldType.Text ||
    fieldType === FieldType.Title ||
    fieldType === FieldType.URL ||
    fieldType === FieldType.Select ||
    fieldType === FieldType.MultiSelect ||
    fieldType === FieldType.Formula ||
    fieldType === FieldType.Link ||
    fieldType === FieldType.Lookup ||
    fieldType === FieldType.CreatedBy ||
    fieldType === FieldType.LastEditedBy ||
    fieldType === FieldType.File
  ) {
    return order === "ASC"
      ? t("table.sort.text.asc")
      : t("table.sort.text.desc")
  }

  // Date/Time types
  if (
    fieldType === FieldType.Date ||
    fieldType === FieldType.CreatedTime ||
    fieldType === FieldType.LastEditedTime
  ) {
    return order === "ASC"
      ? t("table.sort.date.asc")
      : t("table.sort.date.desc")
  }

  // Boolean types (Checkbox) - use text sorting for consistency
  if (fieldType === FieldType.Checkbox) {
    return order === "ASC"
      ? t("table.sort.text.asc")
      : t("table.sort.text.desc")
  }

  // Default fallback
  return order === "ASC" ? t("table.sortAscending") : t("table.sortDescending")
}

function SortableItem({
  item,
  index,
  uiColumns,
  onValueChange,
  onOrderChange,
  onDelete,
  t,
  excludeValues,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // Get field type and dynamic sorting text
  const fieldType = getFieldType(item.column, uiColumns)
  const ascText = getSortingText(fieldType, "ASC", t)
  const descText = getSortingText(fieldType, "DESC", t)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="mt-2 grid grid-cols-[24px_140px_140px_24px] gap-1.5 items-center"
    >
      <Button
        className="h-6 w-6 p-0 text-gray-400 cursor-grab active:cursor-grabbing"
        variant="ghost"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3 w-3" />
      </Button>
      <FieldSelector
        fields={uiColumns}
        value={item.column}
        className="w-full"
        excludeValues={excludeValues}
        onChange={(value) => onValueChange(value, index)}
      />
      <Select
        value={item.order}
        onValueChange={(value) => onOrderChange(value, index)}
      >
        <SelectTrigger id="sort-order-2">
          <SelectValue placeholder={ascText} />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="ASC">{ascText}</SelectItem>
          <SelectItem value="DESC">{descText}</SelectItem>
        </SelectContent>
      </Select>
      <Button
        className="h-6 w-6 p-0 text-gray-400"
        variant="ghost"
        onClick={() => onDelete(index)}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  )
}
export function ViewSortEditor(props: IViewEditorProps) {
  const { t } = useTranslation()
  const { onSortChange } = props
  const { tableName, space } = useContext(TableContext)
  const { currentView } = useCurrentView()
  const { parsedSql } = useViewQuery(currentView)

  const oldOrderBy: OrderByItem[] = useMemo(() => {
    return (parsedSql.orderBy || []).map((item) => {
      return {
        column: (item.by as any).name as string,
        order: item.order as string,
      }
    })
  }, [parsedSql])
  const [addedFields, setAddedFields] = useState<string[]>(
    oldOrderBy.map((item) => item.column)
  )
  const [orderItems, setOrderItems] = useState<OrderByItem[]>(oldOrderBy)

  useEffect(() => {
    setOrderItems(oldOrderBy)
  }, [oldOrderBy])

  useEffect(() => {
    setAddedFields(orderItems.map((item) => item.column))
    onSortChange?.(orderItems)
  }, [onSortChange, orderItems])

  const { uiColumns } = useUiColumns(tableName!, space!)
  const restFields = useMemo(() => {
    return uiColumns.filter((item) => {
      return addedFields.indexOf(item.table_column_name) === -1
    })
  }, [uiColumns, addedFields])

  const addSort = () => {
    const column = restFields[0].table_column_name
    if (restFields.length) {
      setOrderItems([
        ...orderItems,
        {
          column,
          order: "ASC",
        },
      ])
      setAddedFields([...addedFields, column])
    }
  }

  const delSort = useCallback(
    (index: number) => {
      const newOrderItems = [...orderItems]
      newOrderItems.splice(index, 1)
      setOrderItems(newOrderItems)
    },
    [orderItems]
  )

  const onValueChange = useCallback(
    (value: string, index: number) => {
      const newOrderItems = [...orderItems]
      newOrderItems[index].column = value
      setOrderItems(newOrderItems)
    },
    [orderItems]
  )

  const onOrderChange = useCallback(
    (value: string, index: number) => {
      const newOrderItems = [...orderItems]
      newOrderItems[index].order = value
      setOrderItems(newOrderItems)
    },
    [orderItems]
  )

  const handleClearSort = () => {
    setOrderItems([])
  }

  const handleReorder = useCallback(
    (newItems: (OrderByItem & { id: string })[]) => {
      const orderItems = newItems.map(({ id, ...item }) => item)
      setOrderItems(orderItems)
    },
    []
  )

  return (
    <div className="w-[360px] rounded border p-1.5 shadow-sm">
      {!orderItems.length && (
        <span className="select-none text-xs text-muted-foreground">
          {t("table.view.noSortRule")}
        </span>
      )}
      <SortableContainer
        items={orderItems.map((item) => ({ ...item, id: item.column }))}
        onReorder={handleReorder}
        renderItem={(item, index) => {
          const excludeValues = orderItems
            .map((orderItem) => orderItem.column)
            .filter((col) => col !== item.column)

          return (
            <SortableItem
              key={item.column}
              item={item}
              index={index}
              uiColumns={uiColumns}
              onValueChange={onValueChange}
              onOrderChange={onOrderChange}
              onDelete={delSort}
              t={t}
              excludeValues={excludeValues}
            />
          )
        }}
      />
      <hr className="my-1.5" />
      <div className="flex items-center justify-between">
        <Button
          className="h-6 text-xs"
          variant="outline"
          onClick={addSort}
          size="sm"
        >
          {t("table.view.addSort")}
        </Button>
        <Button
          className="h-6 text-xs"
          size="sm"
          variant="ghost"
          onClick={handleClearSort}
        >
          {t("table.view.deleteSort")}
        </Button>
      </div>
    </div>
  )
}
