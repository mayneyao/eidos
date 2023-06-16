import { useEffect, useRef, useState } from "react"
import { Rectangle } from "@glideapps/glide-data-grid"
import { useClickAway } from "ahooks"
import { useLayer } from "react-laag"

import { cn } from "@/lib/utils"
import { useTable } from "@/hooks/use-table"
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

import { checkNewFieldNameIsOk } from "./helper"

interface IFieldEditorDropdownProps {
  menu?: {
    col: number
    bounds: Rectangle
  }
  tableName: string
  databaseName: string
  setMenu: (menu?: { col: number; bounds: Rectangle }) => void
  deleteFieldByColIndex: (col: number) => void
}

export const FieldEditorDropdown = (props: IFieldEditorDropdownProps) => {
  const { menu, setMenu, deleteFieldByColIndex, tableName, databaseName } =
    props
  const isOpen = menu !== undefined
  const ref = useRef<HTMLDivElement>(null)
  const ref2 = useRef<HTMLDivElement>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [currentColIndex, setCurrentColIndex] = useState<number>()

  const inputRef = useRef<HTMLInputElement>(null)
  const { updateFieldName } = useTable(tableName, databaseName)
  const { uiColumns } = useUiColumns(tableName, databaseName)
  const currentField = uiColumns[currentColIndex!]
  const [newFieldName, setNewFieldName] = useState<string>(
    currentField?.name ?? ""
  )
  const [error, setError] = useState<string>()

  const handleNewFieldNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value
    const isOk = checkNewFieldNameIsOk(newName, currentField, uiColumns)
    if (!isOk) {
      setError("Field name already exists")
    } else {
      setError("")
    }
    setNewFieldName(e.target.value)
  }

  const handleChangeFieldName = async () => {
    const tableColumnName = currentField.table_column_name
    if (currentField.name === newFieldName) {
      return
    }
    const isOk = checkNewFieldNameIsOk(newFieldName, currentField, uiColumns)
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
    if (currentField) {
      setNewFieldName(currentField.name)
    }
  }, [currentField])
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

  const handleDeleteFieldClick = () => {
    setCurrentColIndex(menu?.col)
    setMenu(undefined)
  }

  const handleDeleteFieldConfirm = () => {
    if (currentColIndex != null) {
      deleteFieldByColIndex(currentColIndex)
    }
    setIsDeleteDialogOpen(false)
    setCurrentColIndex(undefined)
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
              "hidden min-w-[220px] overflow-hidden rounded-sm bg-white p-1 shadow-md",
              isOpen && "block"
            )}
            onMouseMoveCapture={(e) => e.stopPropagation()}
          >
            <div ref={ref2}>
              {/* <CommonMenuItem>Profile</CommonMenuItem>
              <CommonMenuItem>Billing</CommonMenuItem>
              */}
              <div className="flex flex-col gap-2 p-2">
                <Input
                  ref={inputRef}
                  id="fieldName"
                  value={newFieldName}
                  onBlur={handleChangeFieldName}
                  autoFocus
                  onChange={handleNewFieldNameChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleChangeFieldName()
                    }
                  }}
                  className="col-span-3 h-[32px]"
                />
                {error && <div className="text-red-500">{error}</div>}
              </div>
              {menu?.col != 0 && (
                <DialogTrigger
                  onClick={handleDeleteFieldClick}
                  className="w-full"
                >
                  <CommonMenuItem className="pl-4">Delete Field</CommonMenuItem>
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
