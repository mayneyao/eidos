"use client"

import { memo, useMemo, useRef, useState, useEffect, useCallback } from "react"
import { SelectField } from "@/packages/core/fields/select"
import type { IField } from "@/packages/core/types/IField"
import { VariableSizeList as List } from "react-window"
import AutoSizer from "react-virtualized-auto-sizer"
import { Minimize, Plus } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  KanbanCard,
  KanbanHeader,
  KanbanBoard as OriginKanbanBoard,
} from "@/components/ui/kibo-ui/kanban"
import { DataCard } from "@/components/table/views/shared/data-card"

import type { IGalleryViewProperties } from "../gallery/properties"
import { getKanbanCardWidth, estimateCardHeight } from "./utils"
import {
  NULL_STATUS,
  useKanbanItemOperations,
  type KanbanItem,
  type StatusCount,
} from "./hooks"
import type { IKanbanViewProperties } from "./properties"

interface ListItemData {
  items: KanbanItem[]
  showFields: IField[]
  uiColumnMap: Map<string, IField>
  rawIdNameMap: Map<string, string>
  tableId: string
  space: string
  properties?: IGalleryViewProperties & IKanbanViewProperties
  hiddenFields?: string[]
  status: StatusCount
  cardWidth: number
}

const KanbanCardItem = memo(
  ({
    index,
    style,
    data,
  }: {
    index: number
    style: React.CSSProperties
    data: ListItemData
  }) => {
    const {
      items,
      showFields,
      uiColumnMap,
      rawIdNameMap,
      tableId,
      space,
      properties,
      hiddenFields,
      status,
      cardWidth,
    } = data

    const item = items[index]
    if (!item) return null

    return (
      <div style={style} className="px-2 py-1.5">
        <KanbanCard
          id={item.id}
          name={item.title || item.name || item.id}
          parent={status.status}
          index={index}
        >
          <DataCard
            item={item}
            showFields={showFields}
            titleField="title"
            uiColumnMap={uiColumnMap}
            rawIdNameMap={rawIdNameMap}
            tableId={tableId}
            space={space}
            properties={properties}
            hideCover={!properties?.coverPreview}
            hiddenFields={hiddenFields}
            style={{ padding: 0 }}
            cardClassName=""
          />
        </KanbanCard>
      </div>
    )
  }
)

KanbanCardItem.displayName = "KanbanCardItem"

// Use Intersection Observer for lazy loading
function useInView<T extends HTMLElement>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null!)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const rect = element.getBoundingClientRect()
    const isVisible = rect.left < window.innerWidth && rect.right > 0

    if (isVisible) {
      setIsInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0, rootMargin: "100px" }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, isInView]
}

export const KanbanBoard = memo(
  ({
    status,
    items,
    showFields,
    uiColumnMap,
    rawIdNameMap,
    tableId,
    space,
    properties,
    hiddenFields,
  }: {
    status: StatusCount
    items: KanbanItem[]
    showFields: IField[]
    uiColumnMap: Map<string, IField>
    rawIdNameMap: Map<string, string>
    tableId: string
    space: string
    properties?: IGalleryViewProperties & IKanbanViewProperties
    hiddenFields?: string[]
  }) => {
    const { resolvedTheme } = useTheme()
    const { t } = useTranslation()
    const { createItem } = useKanbanItemOperations(
      tableId,
      space,
      properties?.groupByField
    )
    const [isAdding, setIsAdding] = useState(false)
    const [newItemTitle, setNewItemTitle] = useState("")
    const inputRef = useRef<HTMLInputElement>(null)
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const [inViewRef, isInView] = useInView<HTMLDivElement>()
    const listRef = useRef<List>(null)

    const memoizedItems = useMemo(() => items || [], [items])

    const cardWidth = useMemo(
      () => getKanbanCardWidth(properties?.cardSize),
      [properties?.cardSize]
    )

    const innerCardWidth = useMemo(() => cardWidth - 16, [cardWidth])

    // Notion background color
    const bgColor = SelectField.getColorValue(
      status.color || "gray",
      resolvedTheme === "dark" ? "dark" : "light",
      0.08
    )

    const handleCreateNewItem = async () => {
      const title = newItemTitle.trim()
      if (!title || isSubmitting) return
      setIsSubmitting(true)
      try {
        setNewItemTitle("")
        await createItem(title, status.status)
        setIsAdding(false)
      } finally {
        setIsSubmitting(false)
      }
    }

    const listData: ListItemData = useMemo(
      () => ({
        items: memoizedItems,
        showFields,
        uiColumnMap,
        rawIdNameMap,
        tableId,
        space,
        properties,
        hiddenFields,
        status,
        cardWidth: innerCardWidth,
      }),
      [
        memoizedItems,
        showFields,
        uiColumnMap,
        rawIdNameMap,
        tableId,
        space,
        properties,
        hiddenFields,
        status,
        innerCardWidth,
      ]
    )

    // Calculate single card height - includes spacing
    const getItemSize = useCallback(
      (index: number) => {
        const item = memoizedItems[index]
        if (!item) return 212 // 200 + 12px gap

        const hasCover =
          properties?.coverPreview !== null &&
          properties?.coverPreview !== undefined &&
          properties?.coverPreview !== ""

        // Card content height + spacing (py-1.5 * 2)
        const height =
          estimateCardHeight(
            item,
            showFields,
            properties,
            innerCardWidth,
            "title",
            hasCover
          ) + 12
        return height
      },
      [memoizedItems, showFields, properties, innerCardWidth]
    )

    return (
      <div ref={inViewRef} className="h-full">
        <OriginKanbanBoard
          id={status.status}
          className={cn(
            "flex flex-col shrink-0 transition-all duration-200 h-full",
            isCollapsed ? "w-[50px]" : `w-[${cardWidth}px]`
          )}
          style={{
            backgroundColor: bgColor,
            width: isCollapsed ? 50 : cardWidth,
          }}
        >
          <KanbanHeader>
            <div
              className={cn(
                "flex items-center gap-2 group px-1",
                isCollapsed && "flex-col w-full px-0"
              )}
            >
              <div
                className="h-2 w-2 rounded-full shrink-0"
                style={{
                  backgroundColor: status.color || "transparent",
                  border: status.color ? "none" : "1px solid gray",
                }}
              />
              {isCollapsed ? (
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => setIsCollapsed(false)}
                >
                  <div className="[writing-mode:vertical-rl] text-sm py-2 w-full text-center text-gray-600 dark:text-gray-400">
                    {status.status === NULL_STATUS
                      ? t("kanban.status.unassigned")
                      : status.status}
                    <span className="mt-1">({status.count})</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-sm py-1 w-full font-medium text-gray-700 dark:text-gray-300">
                    {status.status === NULL_STATUS
                      ? t("kanban.status.unassigned")
                      : status.status}
                    <span className="ml-1.5 text-gray-400 dark:text-gray-500 text-xs">
                      {status.count}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600"
                    onClick={() => setIsCollapsed(true)}
                    title={t("kanban.collapse.tooltip")}
                  >
                    <Minimize className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </KanbanHeader>

          {!isCollapsed && (
            <>
              <div className="flex-1 min-h-0">
                {isInView && memoizedItems.length > 0 ? (
                  <AutoSizer>
                    {({ height, width }) => (
                      <List
                        ref={listRef}
                        height={height}
                        itemCount={memoizedItems.length}
                        itemSize={getItemSize}
                        itemData={listData}
                        width={width}
                        overscanCount={3}
                        estimatedItemSize={212}
                      >
                        {KanbanCardItem}
                      </List>
                    )}
                  </AutoSizer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                    {memoizedItems.length === 0 ? "No items" : "Loading..."}
                  </div>
                )}
              </div>

              <div className="relative px-1 flex-shrink-0">
                {isAdding ? (
                  <Card className="absolute bottom-full left-2 right-2 mb-2 p-2 shadow-lg">
                    <input
                      ref={inputRef}
                      type="text"
                      value={newItemTitle}
                      onChange={(e) => setNewItemTitle(e.target.value)}
                      className="w-full px-2 py-1 text-sm border rounded focus:outline-hidden focus:ring-2 focus:ring-primary"
                      placeholder={t("kanban.newItem.inputTitle")}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newItemTitle) {
                          handleCreateNewItem()
                        } else if (e.key === "Escape") {
                          setIsAdding(false)
                          setNewItemTitle("")
                        }
                      }}
                      onBlur={() => {
                        if (!newItemTitle.trim()) setIsAdding(false)
                      }}
                    />
                  </Card>
                ) : null}

                <Button
                  variant="ghost"
                  className="w-full py-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center justify-center gap-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
                  onClick={() => {
                    setIsAdding(true)
                    setTimeout(() => inputRef.current?.focus(), 0)
                  }}
                >
                  <Plus size={14} />
                  <span className="text-xs">{t("kanban.addNew")}</span>
                </Button>
              </div>
            </>
          )}
        </OriginKanbanBoard>
      </div>
    )
  }
)

KanbanBoard.displayName = "KanbanBoard"
