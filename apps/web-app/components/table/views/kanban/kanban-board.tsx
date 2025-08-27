"use client"

import { memo, useMemo, useRef, useState } from "react"
import { SelectField } from "@/packages/core/fields/select"
import type { IField } from "@/packages/core/types/IField"
import { useVirtualList } from "ahooks"
import { Minimize, Plus } from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanBoard as OriginKanbanBoard,
} from "@/components/ui/kibo-ui/kanban"
import { DataCard } from "@/components/table/views/shared/data-card"

import type { IGalleryViewProperties } from "../gallery/properties"
import { computeCardHeight } from "../gallery/utils"
import {
  NULL_STATUS,
  useKanbanItemOperations,
  type KanbanItem,
  type StatusCount,
} from "./hooks"
import type { IKanbanViewProperties } from "./properties"

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
    const containerRef = useRef(null)
    const wrapperRef = useRef(null)
    const cardHeight = computeCardHeight(showFields.length)
    const { theme } = useTheme()
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

    const memoizedItems = useMemo(() => items || [], [items])

    const [list] = useVirtualList(memoizedItems, {
      containerTarget: containerRef,
      wrapperTarget: wrapperRef,
      itemHeight: (index) => {
        const item = items[index]
        if (!item) {
          return 0
        }
        if (!properties?.coverPreview) {
          return cardHeight - 200
        }
        return cardHeight
      },
      overscan: 10,
    })
    const bgColor = SelectField.getColorValue(
      status.color || "gray",
      theme === "dark" ? "dark" : "light",
      0.2
    )
    const cardWidth =
      properties?.cardSize === "small"
        ? "w-[300px]"
        : properties?.cardSize === "medium"
          ? "w-[350px]"
          : "w-[400px]"

    const handleCreateNewItem = async () => {
      const title = newItemTitle.trim()
      if (!title) return
      setNewItemTitle("")
      await createItem(title, status.status)
      setIsAdding(false)
    }

    return (
      <OriginKanbanBoard
        id={status.status}
        className={cn(
          "flex flex-col shrink-0 transition-all duration-200",
          isCollapsed ? "w-[50px]" : cardWidth
        )}
        style={{
          backgroundColor: bgColor,
        }}
      >
        <KanbanHeader>
          <div
            className={cn(
              "flex items-center gap-2 group",
              isCollapsed && "flex-col w-full"
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
                <div className="[writing-mode:vertical-rl] text-sm py-2 w-full text-center">
                  {status.status === NULL_STATUS
                    ? t("kanban.status.unassigned")
                    : status.status}
                  <span className="mt-1">({status.count})</span>
                </div>
              </div>
            ) : (
              <>
                <div className="text-sm py-1 w-full">
                  {status.status === NULL_STATUS
                    ? t("kanban.status.unassigned")
                    : status.status}
                  <span className="mt-1">({status.count})</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setIsCollapsed(true)}
                  title={t("kanban.collapse.tooltip")}
                >
                  <Minimize className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </KanbanHeader>

        {!isCollapsed && (
          <>
            <div
              className="flex-1 overflow-y-auto overflow-x-hidden"
              ref={containerRef}
            >
              <KanbanCards ref={wrapperRef}>
                {list.map(({ data: item, index }) => (
                  <KanbanCard
                    key={item.id}
                    id={item.id}
                    name={item.title || item.name || item.id}
                    parent={status.status}
                    index={index}
                    className={`h-[${cardHeight}px`}
                  >
                    <DataCard
                      key={item.id}
                      item={item}
                      showFields={showFields}
                      titleField={"title"}
                      uiColumnMap={uiColumnMap}
                      rawIdNameMap={rawIdNameMap}
                      tableId={tableId}
                      space={space}
                      properties={properties}
                      hideCover={!properties?.coverPreview}
                      hiddenFields={hiddenFields}
                      style={{ padding: 0 }}
                    />
                  </KanbanCard>
                ))}
              </KanbanCards>
            </div>

            <div className="relative">
              {isAdding ? (
                <Card className="absolute bottom-full left-0 right-0 mb-2 p-2 shadow-lg">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newItemTitle}
                    onChange={(e) => setNewItemTitle(e.target.value)}
                    className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary"
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
                      if (!newItemTitle.trim()) {
                        setIsAdding(false)
                      }
                    }}
                  />
                </Card>
              ) : null}

              <Button
                variant="ghost"
                className="w-full py-2  text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
                onClick={() => {
                  setIsAdding(true)
                  setTimeout(() => inputRef.current?.focus(), 0)
                }}
              >
                <Plus size={16} />
                <span>{t("kanban.addNew")}</span>
              </Button>
            </div>
          </>
        )}
      </OriginKanbanBoard>
    )
  }
)
