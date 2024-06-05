import { useCallback, useEffect, useMemo, useState } from "react"
import { PlusIcon } from "@radix-ui/react-icons"
import update from "immutability-helper"
import { sortBy } from "lodash"
import { ArrowDownUpIcon, SlidersHorizontalIcon } from "lucide-react"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"

import { IView } from "@/lib/store/IView"
import { IField } from "@/lib/store/interface"
import { useCurrentUiColumns } from "@/hooks/use-ui-columns"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CommonMenuItem } from "@/components/common-menu-item"
import { useTableAppStore } from "@/components/grid/store"

import { useViewOperation } from "../hooks"
import { FieldItemCard } from "./view-field-item"

export interface ContainerState {
  cards: IField[]
}

export const ViewField = (props: { view?: IView }) => {
  const [open, setOpen] = useState(false)
  const orderMap = useMemo(
    () => props.view?.order_map || {},
    [props.view?.order_map]
  )
  const hiddenFields = useMemo(
    () => props.view?.hidden_fields || [],
    [props.view?.hidden_fields]
  )
  const { uiColumns } = useCurrentUiColumns()
  const { setIsAddFieldEditorOpen } = useTableAppStore()
  const [cards, setCards] = useState<IField[]>([])
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

  const { updateView } = useViewOperation()
  const updateViewOrderMap = useCallback(
    (newOrderMap: IView["order_map"]) => {
      props.view && updateView(props.view?.id, { order_map: newOrderMap })
    },
    [props.view, updateView]
  )

  const updateHiddenFields = useCallback(
    (newHiddenFields: string[]) => {
      props.view &&
        updateView(props.view?.id, { hidden_fields: newHiddenFields })
    },
    [props.view, updateView]
  )

  const handleHideField = useCallback(
    (fieldId: string) => {
      const hiddenFieldsSet = new Set([...(hiddenFields || [])])
      if (hiddenFieldsSet.has(fieldId)) {
        hiddenFieldsSet.delete(fieldId)
      } else {
        hiddenFieldsSet.add(fieldId)
      }
      updateHiddenFields(Array.from(hiddenFieldsSet))
    },
    [hiddenFields, updateHiddenFields]
  )

  const showAllFields = () => {
    updateHiddenFields([])
  }

  const hideAllFields = () => {
    updateHiddenFields(
      uiColumns
        .filter((field) => field.table_column_name !== "title")
        .map((item) => item.table_column_name)
    )
  }

  const moveCard = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      setCards((prevCards: IField[]) => {
        const newCards = update(prevCards, {
          $splice: [
            [dragIndex, 1],
            [hoverIndex, 0, prevCards[dragIndex] as IField],
          ],
        })
        const newOrderMap: IView["order_map"] = {}
        newCards.forEach((item, index) => {
          newOrderMap[item.table_column_name] = index
        })
        updateViewOrderMap(newOrderMap)
        return newCards
      })
    },
    [updateViewOrderMap]
  )

  const renderCard = useCallback(
    (card: IField, index: number) => {
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
          moveCard={moveCard}
        />
      )
    },
    [handleHideField, hiddenFields, moveCard]
  )

  const handleAddFieldClick = () => {
    setOpen(false)
    setIsAddFieldEditorOpen(true)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={"rounded-md"}>
        <Button size="xs" variant="ghost">
          <SlidersHorizontalIcon className="h-4 w-4 opacity-60"></SlidersHorizontalIcon>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <div className="flex justify-between px-2">
          <Button size="xs" variant="ghost" onClick={showAllFields}>
            show all
          </Button>
          <Button size="xs" variant="ghost" onClick={hideAllFields}>
            hide all
          </Button>
        </div>
        <hr className="my-1" />
        <DndProvider backend={HTML5Backend} context={window}>
          <div className="w-[300px]">
            {cards.map((card, i) => renderCard(card, i))}
          </div>
        </DndProvider>
        <hr className="my-1" />
        <CommonMenuItem className="pl-4" onClick={handleAddFieldClick}>
          <PlusIcon className="mr-2 h-4 w-4" />
          Add Field
        </CommonMenuItem>
      </PopoverContent>
    </Popover>
  )
}
