import { useContext, useEffect, useMemo, useRef, useState } from "react"
import { FieldType } from "@/packages/core/fields/const"
import type { IGridViewProperties, IView } from "@/packages/core/types/IView"
import { useClickAway } from "ahooks"
import {
  ArrowDownWideNarrowIcon,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpNarrowWideIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  Settings2,
  Trash2,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useLayer } from "react-laag"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { CommonMenuItem } from "@/components/common-menu-item"
import {
  TableContext,
  useCurrentView,
  useViewOperation,
} from "@/components/table/hooks"
import { useTableFields } from "@/apps/web-app/hooks/use-table"

import { useColumns } from "../views/grid/hooks/use-col"
import { useTableStore } from "../table-store-provider"
import { FieldNameEdit } from "./field-name-edit"

interface IFieldEditorDropdownProps {
  tableName: string
  databaseName: string
  view: IView
  deleteField: (fieldId: string) => void
}

export const FieldEditorDropdown = (props: IFieldEditorDropdownProps) => {
  const { deleteField, tableName, databaseName } = props
  const {
    menu,
    setMenu,
    setIsFieldPropertiesEditorOpen,
    setIsAddFieldEditorOpen,
    currentUiColumn,
    setCurrentUiColumn,
    setFieldInsertPosition,
  } = useTableStore()

  const { isView } = useContext(TableContext)
  const isOpen = menu !== undefined
  const ref = useRef<HTMLDivElement>(null)
  const ref2 = useRef<HTMLDivElement>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [currentColIndex, setCurrentColIndex] = useState<number>()
  const { currentView } = useCurrentView<IGridViewProperties>()
  const { addSort, freezeColumn, updateView } = useViewOperation()
  const inputRef = useRef<HTMLInputElement>(null)
  const { fields } = useTableFields(tableName)
  const { showColumns } = useColumns(fields, props.view)
  const { t } = useTranslation()

  useEffect(() => {
    if (menu) {
      setCurrentColIndex(menu.col)
      const currentField = showColumns[menu.col]
      setCurrentUiColumn(currentField)
      inputRef.current?.focus()
    }
  }, [menu, showColumns, setCurrentUiColumn])

  const { layerProps, renderLayer } = useLayer({
    isOpen,
    auto: true,
    placement: "bottom-start",
    trigger: {
      getBounds: () => {
        const res = {
          left: menu?.bounds.x ?? 0,
          top: menu?.bounds.y ?? 0,
          width: menu?.bounds.width ?? 0,
          height: menu?.bounds.height ?? 0,
          right: (menu?.bounds.x ?? 0) + (menu?.bounds.width ?? 0),
          bottom: (menu?.bounds.y ?? 0) + (menu?.bounds.height ?? 0),
        }
        return res
      },
    },
  })

  const handleEditFieldPropertiesClick = (e: any) => {
    e.stopPropagation()
    setIsFieldPropertiesEditorOpen(true)
    setMenu(undefined)
  }
  const handleDeleteFieldClick = () => {
    setCurrentColIndex(menu?.col)
    setMenu(undefined)
  }

  const deleteFieldByColIndex = (colIndex: number) => {
    const fieldId = showColumns[colIndex].table_column_name
    deleteField(fieldId)
  }

  const handleDeleteFieldConfirm = () => {
    if (currentColIndex != null) {
      deleteFieldByColIndex(currentColIndex)
    }
    setIsDeleteDialogOpen(false)
    setCurrentColIndex(undefined)
  }

  const addASCSort = () => {
    console.log("addASCSort", currentUiColumn)
    if (currentUiColumn) {
      addSort(currentView!, currentUiColumn.table_column_name, "ASC")
    }
    setMenu(undefined)
  }
  const addDESCSort = () => {
    console.log("addDESCSort", currentUiColumn)

    if (currentUiColumn) {
      addSort(currentView!, currentUiColumn.table_column_name, "DESC")
    }
    setMenu(undefined)
  }

  const showResetFreezeColumn = useMemo(() => {
    return (
      (currentView?.properties?.freezeColumns ?? 0) ===
      (currentColIndex ?? 0) + 1
    )
  }, [currentView?.properties?.freezeColumns, currentColIndex])

  const handleFreezeColumn = () => {
    const colIndex = showColumns.findIndex(
      (col) => col.table_column_name === currentUiColumn?.table_column_name
    )
    if (colIndex !== -1) {
      if (showResetFreezeColumn) {
        freezeColumn(currentView!.id, 0)
      } else {
        freezeColumn(currentView!.id, colIndex + 1)
      }
    }
    setMenu(undefined)
  }

  const handleAddFieldLeft = () => {
    if (currentUiColumn && currentView && menu) {
      const currentPosition = menu.col
      setFieldInsertPosition(currentPosition)
      setIsAddFieldEditorOpen(true)
      setMenu(undefined)
    }
  }

  const handleAddFieldRight = () => {
    if (currentUiColumn && currentView && menu) {
      const currentPosition = menu.col
      setFieldInsertPosition(currentPosition + 1)
      setIsAddFieldEditorOpen(true)
      setMenu(undefined)
    }
  }

  useClickAway(
    () => {
      setMenu(undefined)
    },
    [ref, ref2],
    ["mousedown", "touchstart"]
  )

  return (
    <div ref={ref}>
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        {renderLayer(
          <div
            {...layerProps}
            className={cn(
              "hidden min-w-[220px] overflow-hidden rounded-sm  bg-popover p-1 shadow-md ",
              isOpen && "block"
            )}
            onMouseMoveCapture={(e) => e.stopPropagation()}
          >
            <div ref={ref2}>
              <div className="p-2">
                {currentUiColumn && (
                  <FieldNameEdit
                    field={currentUiColumn}
                    tableName={tableName}
                    databaseName={databaseName}
                    onEditEnd={() => setMenu(undefined)}
                  />
                )}
              </div>

              <CommonMenuItem
                className="pl-4"
                onClick={handleEditFieldPropertiesClick}
              >
                <Settings2 className="mr-2 h-4 w-4" />
                {t("table.editProperty")}
              </CommonMenuItem>
              <CommonMenuItem className="pl-4" onClick={addASCSort}>
                <ArrowUpNarrowWideIcon className="mr-2 h-4 w-4" />
                {t("table.sortAscending")}
              </CommonMenuItem>
              <CommonMenuItem className="pl-4" onClick={addDESCSort}>
                <ArrowDownWideNarrowIcon className="mr-2 h-4 w-4" />
                {t("table.sortDescending")}
              </CommonMenuItem>

              {!isView && (
                <>
                  <CommonMenuItem className="pl-4" onClick={handleAddFieldLeft}>
                    <ChevronLeftIcon className="mr-2 h-4 w-4" />
                    {t("table.insertLeft")}
                  </CommonMenuItem>
                  <CommonMenuItem
                    className="pl-4"
                    onClick={handleAddFieldRight}
                  >
                    <ChevronRightIcon className="mr-2 h-4 w-4" />
                    {t("table.insertRight")}
                  </CommonMenuItem>
                </>
              )}

              <CommonMenuItem className="pl-4" onClick={handleFreezeColumn}>
                {showResetFreezeColumn ? (
                  <ArrowLeftToLine className="mr-2 h-4 w-4" />
                ) : (
                  <ArrowRightToLine className="mr-2 h-4 w-4" />
                )}
                {showResetFreezeColumn
                  ? t("table.resetFreezeColumn")
                  : t("table.freezeToHere")}
              </CommonMenuItem>
              {currentUiColumn?.type !== "title" && !isView && (
                <DialogTrigger
                  onClick={handleDeleteFieldClick}
                  className="w-full"
                >
                  <CommonMenuItem className="pl-4">
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("table.deleteField")}
                  </CommonMenuItem>
                </DialogTrigger>
              )}
              <DialogContent className="max-w-[300px]">
                <DialogHeader>
                  <DialogTitle>
                    {t("table.deleteFieldConfirmation")}
                  </DialogTitle>
                  <DialogDescription>
                    {currentUiColumn?.type === FieldType.Link
                      ? t("table.deleteLinkFieldWarning")
                      : t("common.thisActionCannotBeUndone")}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => setIsDeleteDialogOpen(false)}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteFieldConfirm}
                  >
                    {t("common.delete")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
