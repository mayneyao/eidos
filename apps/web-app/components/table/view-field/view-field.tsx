import { useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { IField } from "@/packages/core/types/IField"
import type { IView } from "@/packages/core/types/IView"
import { PlusIcon } from "@radix-ui/react-icons"
import { SlidersHorizontalIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { sortBy } from "@/lib/lodash"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CommonMenuItem } from "@/components/common-menu-item"
import { useTableStore } from "@/components/table/table-store-provider"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"

import { TableContext, useTableContext, useViewOperation } from "../hooks"
import { SortableContainer } from "../sortable"
import { FieldItemCard } from "./view-field-item"

// Refactored to use @dnd-kit for better performance
export interface ContainerState {
  cards: IField[]
}

export const ViewField = (props: { view?: IView }) => {
  const { t } = useTranslation()
  const { isView } = useTableContext()
  const { tableName, space } = useContext(TableContext)
  const { uiColumns } = useUiColumns(tableName, space)
  const { setIsAddFieldEditorOpen } = useTableStore()
  const { updateView } = useViewOperation()

  const [open, setOpen] = useState(false)
  const [cards, setCards] = useState<IField[]>([])

  const orderMap = useMemo(
    () => props.view?.order_map || {},
    [props.view?.order_map]
  )
  const hiddenFields = useMemo(
    () => props.view?.hidden_fields || [],
    [props.view?.hidden_fields]
  )

  const sortedUiColumns = useMemo(
    () =>
      sortBy(uiColumns, (item) => {
        return orderMap[item.table_column_name] || 0
      }),
    [orderMap, uiColumns]
  )

  useEffect(() => {
    setCards(sortedUiColumns)
  }, [sortedUiColumns])

  const updateViewOrderMap = useCallback(
    (newOrderMap: IView["order_map"]) => {
      if (!props.view) return
      updateView(props.view.id, { order_map: newOrderMap })
    },
    [props.view, updateView]
  )

  const updateHiddenFields = useCallback(
    (newHiddenFields: string[]) => {
      if (!props.view) return
      updateView(props.view.id, { hidden_fields: newHiddenFields })
    },
    [props.view, updateView]
  )

  const handleHideField = useCallback(
    (fieldId: string) => {
      if (!props.view) return
      const hiddenFieldsSet = new Set([...(hiddenFields || [])])
      if (hiddenFieldsSet.has(fieldId)) {
        hiddenFieldsSet.delete(fieldId)
      } else {
        hiddenFieldsSet.add(fieldId)
      }
      updateHiddenFields(Array.from(hiddenFieldsSet))
    },
    [hiddenFields, updateHiddenFields, props.view]
  )

  const showAllFields = useCallback(() => {
    if (!props.view) return
    updateHiddenFields([])
  }, [updateHiddenFields, props.view])

  const hideAllFields = useCallback(() => {
    if (!props.view) return
    updateHiddenFields(
      uiColumns
        .filter((field) => field.table_column_name !== "title")
        .map((item) => item.table_column_name)
    )
  }, [updateHiddenFields, uiColumns, props.view])

  const handleReorder = useCallback(
    (newCards: IField[]) => {
      if (!props.view) return
      setCards(newCards)
      const newOrderMap: IView["order_map"] = {}
      newCards.forEach((item, index) => {
        newOrderMap[item.table_column_name] = index
      })
      updateViewOrderMap(newOrderMap)
    },
    [updateViewOrderMap, props.view]
  )

  const handleAddFieldClick = useCallback(() => {
    setOpen(false)
    setIsAddFieldEditorOpen(true)
  }, [setIsAddFieldEditorOpen])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={"rounded"} asChild>
        <Button size="xs" variant="ghost">
          <SlidersHorizontalIcon className="h-4 w-4 opacity-60"></SlidersHorizontalIcon>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <div className="flex items-center justify-between px-1.5 py-1.5 border-b">
          <span className="text-[11px] text-muted-foreground pl-[21px]">
            {t("table.view.field.shownInView", "Shown in view")}
          </span>
          <div className="flex items-center">
            <Button
              size="xs"
              variant="ghost"
              onClick={showAllFields}
              className="h-6 text-[11px] px-1.5"
            >
              {t("table.view.field.showAll")}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={hideAllFields}
              className="h-6 text-[11px] px-1.5"
            >
              {t("table.view.field.hideAll")}
            </Button>
          </div>
        </div>
        <SortableContainer
          items={cards.map((card) => ({ ...card, id: card.table_column_name }))}
          onReorder={handleReorder}
          className="max-h-[320px] w-[280px] overflow-y-auto overflow-x-hidden p-1"
          renderItem={(item, index) => {
            const card = item as IField
            const isHidden =
              (hiddenFields || []).indexOf(card.table_column_name) !== -1
            return (
              <FieldItemCard
                field={card}
                key={card.table_column_name}
                index={index}
                id={card.table_column_name}
                isHidden={isHidden}
                text={card.name}
                onToggleHidden={handleHideField}
              />
            )
          }}
        />
        {!isView && (
          <>
            <div className="border-t border-border" />
            <div className="p-1">
              <CommonMenuItem className="text-xs" onClick={handleAddFieldClick}>
                <PlusIcon className="mr-2 h-3.5 w-3.5" />
                {t("table.view.field.addField")}
              </CommonMenuItem>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
