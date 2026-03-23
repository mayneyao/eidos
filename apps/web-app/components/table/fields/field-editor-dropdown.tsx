import React, { useContext, useEffect, useMemo, useRef, useState } from "react"
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
  GripVerticalIcon,
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
import { Separator } from "@/components/ui/separator"
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

interface IMenuItem {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: (e?: any) => void
  variant?: "destructive"
  dialogTrigger?: boolean
}

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
    if (currentUiColumn) {
      addSort(currentView!, currentUiColumn.table_column_name, "ASC")
    }
    setMenu(undefined)
  }

  const addDESCSort = () => {
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

  const menuGroups: { id: string; items: IMenuItem[] }[] = [
    {
      id: "edit",
      items: [
        {
          icon: Settings2,
          label: t("table.editProperty"),
          onClick: handleEditFieldPropertiesClick,
        },
      ],
    },
    {
      id: "sort",
      items: [
        {
          icon: ArrowUpNarrowWideIcon,
          label: t("table.sortAscending"),
          onClick: addASCSort,
        },
        {
          icon: ArrowDownWideNarrowIcon,
          label: t("table.sortDescending"),
          onClick: addDESCSort,
        },
      ],
    },
    {
      id: "insert",
      items: !isView
        ? [
            {
              icon: ChevronLeftIcon,
              label: t("table.insertLeft"),
              onClick: handleAddFieldLeft,
            },
            {
              icon: ChevronRightIcon,
              label: t("table.insertRight"),
              onClick: handleAddFieldRight,
            },
          ]
        : [],
    },
    {
      id: "freeze",
      items: [
        {
          icon: showResetFreezeColumn ? ArrowLeftToLine : ArrowRightToLine,
          label: showResetFreezeColumn
            ? t("table.resetFreezeColumn")
            : t("table.freezeToHere"),
          onClick: handleFreezeColumn,
        },
      ],
    },
    {
      id: "delete",
      items:
        currentUiColumn?.type !== "title" && !isView
          ? [
              {
                icon: Trash2,
                label: t("table.deleteField"),
                onClick: handleDeleteFieldClick,
                variant: "destructive" as const,
                dialogTrigger: true,
              },
            ]
          : [],
    },
  ]

  return (
    <div ref={ref}>
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        {renderLayer(
          <div
            {...layerProps}
            className={cn(
              "hidden min-w-[200px] overflow-hidden rounded-lg bg-popover p-1 shadow-xl border",
              isOpen && "block animate-in fade-in zoom-in-95 duration-100"
            )}
            onMouseMoveCapture={(e) => e.stopPropagation()}
          >
            <div ref={ref2}>
              {/* Field Name Edit Section */}
              <div className="px-2 py-1.5 mb-0.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <GripVerticalIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t("table.field.fieldName")}
                  </span>
                </div>
                {currentUiColumn && (
                  <FieldNameEdit
                    field={currentUiColumn}
                    tableName={tableName}
                    databaseName={databaseName}
                    onEditEnd={() => setMenu(undefined)}
                  />
                )}
              </div>

              <Separator className="my-1" />

              {/* Menu Groups */}
              {menuGroups.map((group, groupIndex) =>
                group.items.length > 0 ? (
                  <div key={group.id}>
                    {groupIndex > 0 && <Separator className="my-1" />}
                    <div className="space-y-0">
                      {group.items.map((item, itemIndex) => {
                        const content = (
                          <CommonMenuItem
                            className={cn(
                              "pl-2 py-1",
                              item.variant === "destructive" &&
                                "text-destructive hover:text-destructive hover:bg-destructive/10"
                            )}
                            onClick={
                              item.dialogTrigger ? undefined : item.onClick
                            }
                          >
                            <item.icon
                              className={cn(
                                "mr-2 h-3.5 w-3.5 shrink-0",
                                item.variant === "destructive"
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                              )}
                            />
                            <span className="text-xs">{item.label}</span>
                          </CommonMenuItem>
                        )

                        return item.dialogTrigger ? (
                          <DialogTrigger
                            key={`${group.id}-${itemIndex}`}
                            onClick={item.onClick}
                            className="w-full"
                          >
                            {content}
                          </DialogTrigger>
                        ) : (
                          <div key={`${group.id}-${itemIndex}`}>{content}</div>
                        )
                      })}
                    </div>
                  </div>
                ) : null
              )}

              {/* Delete Confirmation Dialog */}
              <DialogContent className="max-w-[300px]">
                <DialogHeader className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-full bg-destructive/10">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </div>
                    <DialogTitle className="text-sm">
                      {t("table.deleteFieldConfirmation")}
                    </DialogTitle>
                  </div>
                  <DialogDescription className="text-xs leading-relaxed">
                    {currentUiColumn?.type === FieldType.Link
                      ? t("table.deleteLinkFieldWarning")
                      : t("common.thisActionCannotBeUndone")}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-1.5 sm:gap-1.5 mt-3">
                  <Button
                    variant="outline"
                    onClick={() => setIsDeleteDialogOpen(false)}
                    className="h-7 text-xs"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteFieldConfirm}
                    className="h-7 text-xs"
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
