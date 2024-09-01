import { useContext, useState } from "react"
import { LayoutGridIcon, LayoutListIcon, Table2Icon } from "lucide-react"
import ReactDOM from "react-dom"

import { IView, ViewTypeEnum } from "@/lib/store/IView"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { Button } from "../ui/button"
import { TABLE_CONTENT_ELEMENT_ID } from "./helper"
import { TableContext } from "./hooks"
import { useViewLoadingStore } from "./hooks/use-view-loading"
import { ViewEditor } from "./view-editor/view-editor"

interface IViewItemProps {
  view: IView
  isActive: boolean
  jump2View: (viewId: string) => void
  deleteView: () => void
  disabledDelete?: boolean
}

export const ViewIconMap = {
  [ViewTypeEnum.Grid]: Table2Icon,
  [ViewTypeEnum.Gallery]: LayoutGridIcon,
  [ViewTypeEnum.DocList]: LayoutListIcon,
}

export const ViewItem = ({
  view,
  isActive,
  jump2View,
  deleteView,
  disabledDelete,
}: IViewItemProps) => {
  const [open, setOpen] = useState(false)
  const { getLoading } = useViewLoadingStore()
  const loading = getLoading(view.query)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const { isReadOnly } = useContext(TableContext)

  const Icon = ViewIconMap[view.type]
  const handleOpen = () => {
    if (isActive && !isReadOnly) {
      setOpen(!open)
    }
  }

  const handleEdit = () => {
    if (!isReadOnly) {
      setEditDialogOpen(true)
      setOpen(false)
    }
  }

  return (
    <>
      {!isReadOnly ? (
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DropdownMenu onOpenChange={handleOpen} open={open}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                onClick={() => jump2View(view.id)}
                size="sm"
                className={cn({
                  "opacity-60": !isActive,
                  "border-b-2 border-primary  rounded-b-none": isActive,
                  "animate-border-flicker": loading,
                })}
              >
                <div className="flex items-center gap-1">
                  <Icon className="h-4 w-4" />
                  <span className="select-none">{view.name}</span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={handleEdit} disabled={isReadOnly}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem disabled={disabledDelete || isReadOnly}>
                <DialogTrigger className="flex w-full cursor-default">
                  Delete
                </DialogTrigger>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Are you sure delete this view?</DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will permanently delete the
                view
              </DialogDescription>
              <DialogFooter>
                <Button
                  variant="secondary"
                  onClick={() => setDeleteDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={deleteView}>
                  Delete
                </Button>
              </DialogFooter>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      ) : (
        <Button
          variant="ghost"
          onClick={() => jump2View(view.id)}
          size="sm"
          className={cn({
            "opacity-60": !isActive,
            "border-b-2 border-primary  rounded-b-none": isActive,
            "animate-border-flicker": loading,
          })}
        >
          <div className="flex items-center gap-1">
            <Icon className="h-4 w-4" />
            <span className="select-none">{view.name}</span>
          </div>
        </Button>
      )}
      {editDialogOpen &&
        ReactDOM.createPortal(
          <ViewEditor setEditDialogOpen={setEditDialogOpen} view={view} />,
          document.getElementById(TABLE_CONTENT_ELEMENT_ID)!
        )}
    </>
  )
}
