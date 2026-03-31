import { FieldType } from "@/packages/core/fields/const"
import type { IField } from "@/packages/core/types/IField"
import { MoreHorizontalIcon } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { layout, prepare } from "@chenglou/pretext"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRowDataOperation } from "../../../doc-property/hook"
import { CellEditor } from "../../cell-editor"
import { useTableContext } from "../../hooks"
import type { IGalleryViewProperties } from "../gallery/properties"
import { GalleryCardCover } from "./card-cover"
import { DataCardMenu } from "./data-card-menu"

// Font configuration
const FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

// Text height cache
const textHeightCache = new Map<string, { height: number; lineCount: number }>()

/**
 * Use pretext to precisely measure text height
 */
function measureTextHeight(
  text: string,
  maxWidth: number,
  fontSize: number = 14,
  lineHeight: number = 20
): { height: number; lineCount: number } {
  if (!text || text.trim().length === 0) {
    return { height: lineHeight, lineCount: 1 }
  }

  const font = `${fontSize}px ${FONT_FAMILY}`
  const cacheKey = `${text}:${font}:${maxWidth}`

  const cached = textHeightCache.get(cacheKey)
  if (cached) return cached

  try {
    const prepared = prepare(text, font)
    const result = layout(prepared, maxWidth, lineHeight)

    // Use lineCount * lineHeight to match CSS line-height behavior
    const calculatedHeight = result.lineCount * lineHeight
    const data = {
      height: calculatedHeight,
      lineCount: result.lineCount,
    }

    // Limit cache size
    if (textHeightCache.size > 500) {
      const firstKey = textHeightCache.keys().next().value
      if (firstKey !== undefined) {
        textHeightCache.delete(firstKey)
      }
    }

    textHeightCache.set(cacheKey, data)
    return data
  } catch {
    // Fallback handling
    const estimatedLines = Math.ceil((text.length * 8) / maxWidth) || 1
    return {
      height: Math.min(estimatedLines, 3) * lineHeight,
      lineCount: Math.min(estimatedLines, 3),
    }
  }
}

interface DataCardProps {
  item: Record<string, any>
  coverField?: IField
  rawIdNameMap: Map<string, string>
  style?: React.CSSProperties
  properties?: IGalleryViewProperties
  showFields: IField[]
  hiddenFields?: string[]
  tableId: string
  space: string
  uiColumnMap: Map<string, IField>
  padding?: number
  cardClassName?: string
  hideCover?: boolean
  titleField: string
  hasCover?: boolean
}

/**
 * Notion-style title component
 */
const DynamicTitle = ({
  title,
  isView,
}: {
  title: string | null | undefined
  isView?: boolean
}) => {
  if (isView) {
    return null
  }

  return (
    <div
      className={cn(
        "font-semibold text-[15px] leading-[1.4] text-gray-900 dark:text-gray-100"
      )}
      title={title || undefined}
    >
      {title ? (
        <span className="break-words">{title}</span>
      ) : (
        <span className="opacity-50 italic">Untitled</span>
      )}
    </div>
  )
}

/**
 * Determine display mode supported by field type
 */
function getFieldDisplayType(
  fieldType: FieldType
): "editable" | "select" | "text" | "readonly" {
  switch (fieldType) {
    case FieldType.Select:
    case FieldType.MultiSelect:
      return "select"
    case FieldType.Text:
    case FieldType.Title:
    case FieldType.Formula:
    case FieldType.URL:
      return "text"
    case FieldType.Checkbox:
    case FieldType.Date:
    case FieldType.DateTime:
    case FieldType.Rating:
    case FieldType.Number:
    case FieldType.File:
    case FieldType.CreatedTime:
    case FieldType.LastEditedTime:
    case FieldType.CreatedBy:
    case FieldType.LastEditedBy:
      return "editable"
    default:
      return "readonly"
  }
}

// Debug mode switch - set to true to show height borders
const DEBUG_MODE = false

export const DataCard = ({
  item,
  coverField,
  rawIdNameMap,
  style,
  properties,
  showFields,
  tableId,
  space,
  uiColumnMap,
  padding,
  cardClassName,
  hideCover,
  titleField,
  hasCover = true,
}: DataCardProps) => {
  const { setProperty } = useRowDataOperation()
  const { isView } = useTableContext()
  const contentRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [contentWidth, setContentWidth] = useState(280) // Default width

  // Measure content area width and card height
  useLayoutEffect(() => {
    if (contentRef.current) {
      setContentWidth(contentRef.current.clientWidth)
    }
  }, [])

  if (!item) {
    return <div style={style}></div>
  }

  const handleChange = (column: string, value: any) => {
    setProperty(tableId, item._id, {
      [column]: value,
    })
  }

  const fieldKeys = useMemo(() => {
    if (isView) {
      return showFields.map((k) => k.table_column_name)
    }
    return showFields
      .filter(
        (k) => k.table_column_name != "_id" && k.table_column_name != "title"
      )
      .map((k) => k.table_column_name)
  }, [isView, showFields])

  const visibleFields = useMemo(() => {
    return fieldKeys
      .map((k) => {
        const fieldName = rawIdNameMap.get(k)!
        const uiColumn = uiColumnMap.get(fieldName) as IField
        if (!uiColumn) return null
        const value = item[k]
        if (!value && properties?.hideEmptyFields) return null
        return { key: k, field: uiColumn, value, fieldName }
      })
      .filter(Boolean) as Array<{
      key: string
      field: IField
      value: any
      fieldName: string
    }>
  }, [fieldKeys, rawIdNameMap, uiColumnMap, item, properties?.hideEmptyFields])

  // Debug: Log actual card height and detailed measurements
  useEffect(() => {
    if (DEBUG_MODE && cardRef.current && item?._id) {
      console.log(
        `[DataCard Debug] ${item._id}: contentWidth=${contentWidth}px`
      )

      // Measure MultiSelect field dimensions
      const multiSelectField = contentRef.current?.querySelector(
        '[data-field-type="multi-select"]'
      ) as HTMLElement
      if (multiSelectField) {
        const tags = multiSelectField.querySelectorAll("span")
        console.log(`[MultiSelect Debug] ${item._id}:`, {
          fieldHeight: multiSelectField.getBoundingClientRect().height,
          tagCount: tags.length,
          tags: Array.from(tags).map((t, i) => ({
            index: i,
            width: t.getBoundingClientRect().width,
            text: t.textContent?.slice(0, 10),
          })),
        })
      }
      const cardHeight = cardRef.current.getBoundingClientRect().height
      const contentHeight =
        contentRef.current?.getBoundingClientRect().height || 0
      const titleEl = contentRef.current?.querySelector(
        '[data-debug="title"]'
      ) as HTMLElement
      const fieldsEl = contentRef.current?.querySelector(
        '[data-debug="fields"]'
      ) as HTMLElement
      const fieldEls =
        contentRef.current?.querySelectorAll('[data-debug="field"]') || []
      const fieldDetails = Array.from(fieldEls).map((el, i) => {
        const height = (el as HTMLElement).getBoundingClientRect().height
        const field = visibleFields[i]
        return {
          index: i,
          height: Math.round(height),
          type: field?.field?.type,
          name: field?.field?.table_column_name,
          isMultiLine:
            field &&
            (getFieldDisplayType(field.field.type as FieldType) === "text" ||
              field.field.type === FieldType.MultiSelect),
        }
      })

      console.log(`[DataCard Height] ${item._id}:`, {
        total: Math.round(cardHeight),
        content: Math.round(contentHeight),
        title: titleEl?.getBoundingClientRect().height,
        fields: fieldsEl?.getBoundingClientRect().height,
        fieldDetails,
      })
    }
  }, [item?._id, visibleFields])

  return (
    <DataCardMenu item={item} tableId={tableId} space={space} isView={isView}>
      <div
        ref={cardRef}
        style={{
          ...style,
          padding: padding ? `${padding}px` : undefined,
        }}
      >
        <div className={cardClassName}>
          {/* Cover area */}
          {!hideCover && hasCover && (
            <div
              className={cn(
                "relative group/card",
                DEBUG_MODE && "border-2 border-blue-500"
              )}
            >
              <div className="h-[160px] w-full overflow-hidden rounded-t-xl">
                <GalleryCardCover
                  item={item}
                  coverField={coverField}
                  coverPreview={properties?.coverPreview || ""}
                  fitContent={properties?.fitContent}
                  rawIdNameMap={rawIdNameMap}
                />
              </div>
              {!isView && (
                <div className="absolute top-2 right-2 opacity-0 group-hover/card:opacity-100 transition-opacity duration-200 flex gap-1">
                  {/* <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7 bg-white/90 hover:bg-white shadow-sm"
                    onClick={(e) => {
                      e.stopPropagation()
                    }}
                  >
                    <PencilIcon className="h-3.5 w-3.5 text-gray-600" />
                  </Button> */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-white/90 hover:bg-white shadow-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontalIcon className="h-3.5 w-3.5 text-gray-600" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem>Open</DropdownMenuItem>
                      <DropdownMenuItem>Open in full page</DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600">
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          )}

          {/* Content area */}
          <div
            ref={contentRef}
            className={cn(
              "p-4 bg-white dark:bg-gray-900",
              hasCover ? "rounded-b-xl" : "rounded-xl"
            )}
          >
            {/* Title area */}
            <div
              data-debug="title"
              className={cn(DEBUG_MODE && "border-2 border-green-500")}
            >
              <DynamicTitle title={item?.[titleField]} isView={isView} />
            </div>

            {/* Field list - unified layout */}
            {visibleFields.length > 0 && (
              <div data-debug="fields" className="mt-3 space-y-1">
                {visibleFields.map(({ key, field, value }) => {
                  const displayType = getFieldDisplayType(
                    field.type as FieldType
                  )

                  // Fields that support multi-line display
                  const isMultiLineField =
                    displayType === "text" ||
                    field.type === FieldType.MultiSelect
                  // Text field height determined by content, other fields fixed at 24px
                  const fieldHeight = isMultiLineField ? undefined : 24

                  return (
                    <div
                      key={`${item._id}:${key}`}
                      data-debug="field"
                      data-field-type={field.type}
                      ref={(el) => {
                        if (DEBUG_MODE && el) {
                          const height = el.getBoundingClientRect().height
                          const label = el.querySelector(
                            "[data-debug-label]"
                          ) as HTMLElement
                          if (label) {
                            label.textContent = `${Math.round(height)}px`
                          }
                        }
                      }}
                      className={cn(
                        "text-sm relative",
                        isMultiLineField
                          ? ""
                          : "flex items-center overflow-hidden",
                        DEBUG_MODE && "border-2 border-red-500"
                      )}
                      style={{
                        minHeight: isMultiLineField ? undefined : 24,
                        height: isMultiLineField ? undefined : 24,
                        backgroundColor: DEBUG_MODE
                          ? "rgba(255,0,0,0.05)"
                          : undefined,
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {DEBUG_MODE && (
                        <span
                          data-debug-label
                          className="absolute top-0 right-0 text-[8px] bg-red-500 text-white px-1 rounded z-10"
                        >
                          measuring...
                        </span>
                      )}
                      <CellEditor
                        field={field}
                        value={value}
                        onChange={(_value) => {
                          if (value != _value) {
                            handleChange(field.table_column_name, _value)
                          }
                        }}
                        className="w-full h-full"
                        disableTextBaseEditor
                        inline={field.type !== FieldType.MultiSelect}
                        layout="flow"
                        displayMode={isMultiLineField}
                        disabled
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </DataCardMenu>
  )
}
