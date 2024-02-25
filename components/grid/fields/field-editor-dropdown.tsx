import { useEffect, useRef, useState } from "react"
import { useClickAway } from "ahooks"
import {
  ArrowDownNarrowWideIcon,
  ArrowUpNarrowWideIcon,
  Settings2,
  Trash2,
} from "lucide-react"
import { useLayer } from "react-laag"

import { IView } from "@/lib/store/IView"
import { cn } from "@/lib/utils"
import { useTableOperation } from "@/hooks/use-table"
import { useUiColumns } from "@/hooks/use-ui-columns"
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
import { Input } from "@/components/ui/input"
import { CommonMenuItem } from "@/components/common-menu-item"
import { useCurrentView, useViewOperation } from "@/components/table/hooks"

import { useColumns } from "../hooks/use-col"
import { useTableAppStore } from "../store"
import { checkNewFieldNameIsOk } from "./helper"

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
    currentUiColumn,
    setCurrentUiColumn,
  } = useTableAppStore()

  const isOpen = menu !== undefined
  const ref = useRef<HTMLDivElement>(null)
  const ref2 = useRef<HTMLDivElement>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [currentColIndex, setCurrentColIndex] = useState<number>()
  const { currentView } = useCurrentView({
    space: databaseName,
    tableName: tableName,
    viewId: props.view?.id,
  })
  const { addSort } = useViewOperation()
  const inputRef = useRef<HTMLInputElement>(null)
  const { updateFieldName } = useTableOperation(tableName, databaseName)
  const { uiColumns } = useUiColumns(tableName, databaseName)
  const { showColumns } = useColumns(uiColumns, props.view)
  const [newFieldName, setNewFieldName] = useState<string>(
    currentUiColumn?.name ?? ""
  )
  useEffect(() => {
    const currentField = uiColumns[currentColIndex!]
    setCurrentUiColumn(currentField)
  }, [currentColIndex, setCurrentUiColumn, uiColumns])

  const [error, setError] = useState<string>()

  const handleNewFieldNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value
    if (!currentUiColumn) return
    const isOk = checkNewFieldNameIsOk(newName, currentUiColumn, uiColumns)
    if (!isOk) {
      if (newName.length === 0) {
        setError("Field name cannot be empty")
      } else {
        setError("Field name already exists")
      }
    } else {
      setError("")
    }
    setNewFieldName(e.target.value)
  }

  const handleChangeFieldName = async () => {
    if (!currentUiColumn) return
    const tableColumnName = currentUiColumn.table_column_name
    if (currentUiColumn.name === newFieldName) {
      return
    }
    const isOk = checkNewFieldNameIsOk(newFieldName, currentUiColumn, uiColumns)
    if (isOk) {
      updateFieldName(tableColumnName, newFieldName)
      setMenu(undefined)
    }
  }

  useEffect(() => {
    if (menu) {
      setCurrentColIndex(menu.col)
      inputRef.current?.focus()
    }
  }, [menu])

  useEffect(() => {
    if (currentUiColumn) {
      setNewFieldName(currentUiColumn.name)
    }
  }, [currentUiColumn])
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
              "hidden min-w-[220px] overflow-hidden rounded-sm bg-white p-1 shadow-md dark:bg-black",
              isOpen && "block"
            )}
            onMouseMoveCapture={(e) => e.stopPropagation()}
          >
            <div ref={ref2}>
              <div className="flex flex-col gap-2 p-2">
                <Input
                  ref={inputRef}
                  id="fieldName"
                  value={newFieldName}
                  onBlur={handleChangeFieldName}
                  autoFocus
                  autoComplete="off"
                  onChange={handleNewFieldNameChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleChangeFieldName()
                    }
                    if (e.key === "Escape") {
                      setMenu(undefined)
                    }
                  }}
                  className="col-span-3 h-[32px]"
                />
                {error && <div className="text-red-500">{error}</div>}
              </div>

              <CommonMenuItem
                className="pl-4"
                onClick={handleEditFieldPropertiesClick}
              >
                <Settings2 className="mr-2 h-4 w-4" />
                Edit Property
              </CommonMenuItem>
              <CommonMenuItem className="pl-4" onClick={addASCSort}>
                <ArrowUpNarrowWideIcon className="mr-2 h-4 w-4" />
                Sort Ascending
              </CommonMenuItem>
              <CommonMenuItem className="pl-4" onClick={addDESCSort}>
                <ArrowDownNarrowWideIcon className="mr-2 h-4 w-4" />
                Sort Descending
              </CommonMenuItem>
              {currentUiColumn?.type !== "title" && (
                <DialogTrigger
                  onClick={handleDeleteFieldClick}
                  className="w-full"
                >
                  <CommonMenuItem className="pl-4">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Field
                  </CommonMenuItem>
                </DialogTrigger>
              )}
              <DialogContent className="max-w-[300px]">
                <DialogHeader>
                  <DialogTitle>Are you sure delete this field?</DialogTitle>
                  <DialogDescription></DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => setIsDeleteDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteFieldConfirm}
                  >
                    Delete
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
