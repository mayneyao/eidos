import { useState } from "react"
import { LayoutGridIcon, Table2Icon } from "lucide-react"

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
import { ViewEditor } from "./view-editor"

interface IViewItemProps {
  view: IView
  isActive: boolean
  jump2View: (viewId: string) => void
  deleteView: () => void
  disabledDelete?: boolean
}

const ViewIconMap = {
  [ViewTypeEnum.Grid]: Table2Icon,
  [ViewTypeEnum.Gallery]: LayoutGridIcon,
}
export const ViewItem = ({
  view,
  isActive,
  jump2View,
  deleteView,
  disabledDelete,
}: IViewItemProps) => {
  const [open, setOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  const Icon = ViewIconMap[view.type]
  const handleOpen = () => {
    if (isActive) {
      setOpen(!open)
    }
  }

  const handleEdit = () => {
    setEditDialogOpen(true)
    setOpen(false)
  }

  return (
    <>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DropdownMenu onOpenChange={handleOpen} open={open}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              onClick={() => jump2View(view.id)}
              size="sm"
              className={cn({
                "opacity-70": !isActive,
                " border-b-2 border-primary  rounded-b-none": isActive,
              })}
            >
              <div className="flex items-center gap-1">
                <Icon className="h-4 w-4" />
                <span className="select-none">{view.name}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={handleEdit}>Edit</DropdownMenuItem>
            <DropdownMenuItem disabled={disabledDelete}>
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
      {editDialogOpen && (
        <ViewEditor setEditDialogOpen={setEditDialogOpen} view={view} />
      )}
    </>
  )
}
