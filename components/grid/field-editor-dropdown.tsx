import { useEffect, useRef, useState } from "react"
import { Rectangle } from "@glideapps/glide-data-grid"
import { useClickAway } from "ahooks"
import { useLayer } from "react-laag"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

import { CommonMenuItem } from "../common-menu-item"
import { Button } from "../ui/button"

interface IFieldEditorDropdownProps {
  menu?: {
    col: number
    bounds: Rectangle
  }
  setMenu: (menu?: { col: number; bounds: Rectangle }) => void
  deleteFieldByColIndex: (col: number) => void
}

export const FieldEditorDropdown = (props: IFieldEditorDropdownProps) => {
  const { menu, setMenu, deleteFieldByColIndex } = props
  const isOpen = menu !== undefined
  const ref = useRef<HTMLDivElement>(null)
  const ref2 = useRef<HTMLDivElement>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [currentColIndex, setCurrentColIndex] = useState<number>()
  useEffect(() => {
    if (menu) {
      setCurrentColIndex(menu.col)
    }
  }, [menu])
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
              {/* <CommonMenuItem>Edit Name</CommonMenuItem> */}
              {menu?.col != 0 && (
                <DialogTrigger
                  onClick={handleDeleteFieldClick}
                  className="w-full"
                >
                  <CommonMenuItem>Delete Field</CommonMenuItem>
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
