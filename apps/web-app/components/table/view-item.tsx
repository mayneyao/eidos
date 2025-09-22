import { useContext, useState } from "react"
import { type IView } from "@/packages/core/types/IView"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useTranslation } from "react-i18next"
import { MoreHorizontalIcon } from "lucide-react"

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
import { ViewIcon } from "./view-icon"

interface IViewItemProps {
  view: IView
  isActive: boolean
  jump2View: (viewId: string) => void
  deleteView: () => void
  disabledDelete?: boolean
  isInDropdown?: boolean
  isReadOnly?: boolean
  onEditStart?: () => void
}



export const ViewItem = ({
  view,
  isActive,
  jump2View,
  deleteView,
  disabledDelete,
  isInDropdown = false,
  isReadOnly: propIsReadOnly,
  onEditStart,
}: IViewItemProps) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { getLoading } = useViewLoadingStore()
  const loading = getLoading(view.query)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const { isReadOnly: contextIsReadOnly } = useContext(TableContext)
  const isReadOnly = propIsReadOnly ?? contextIsReadOnly

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: view.id,
      animateLayoutChanges: () => false,
    })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleOpen = () => {
    if (!isReadOnly) {
      setOpen(!open)
    }
  }

  const handleEdit = () => {
    if (!isReadOnly) {
      onEditStart?.()
      setOpen(false)
    }
  }

  if (isInDropdown) {
    return (
      <>
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <div ref={setNodeRef} style={style} className="w-full group">
            <div 
              className={cn(
                "flex items-center gap-2 w-full rounded-sm px-2 py-1 group-hover:bg-accent/50 transition-colors duration-200",
                {
                  "bg-accent": isActive,
                  "animate-border-flicker": loading,
                }
              )}
            >
              <div
                {...attributes}
                {...listeners}
                className="flex items-center cursor-grab active:cursor-grabbing"
              >
                <ViewIcon 
                  viewType={view.type} 
                  className="h-4 w-4"
                  showCursor={false}
                />
              </div>
              <span 
                className="select-none flex-1 text-left truncate cursor-pointer"
                onClick={() => jump2View(view.id)}
              >
                {view.name}
              </span>
              
              {!isReadOnly && (
                <DropdownMenu onOpenChange={handleOpen} open={open}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 hover:bg-accent/80 transition-opacity duration-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontalIcon className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={handleEdit} disabled={isReadOnly}>
                      {t("table.view.edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={disabledDelete || isReadOnly}>
                      <DialogTrigger className="flex w-full cursor-default">
                        {t("common.delete")}
                      </DialogTrigger>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("table.view.deleteConfirmTitle")}</DialogTitle>
              <DialogDescription>
                {t("table.view.deleteConfirmDescription")}
              </DialogDescription>
              <DialogFooter>
                <Button
                  variant="secondary"
                  onClick={() => setDeleteDialogOpen(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button variant="destructive" onClick={deleteView}>
                  {t("common.delete")}
                </Button>
              </DialogFooter>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <>
      {!isReadOnly ? (
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DropdownMenu onOpenChange={handleOpen} open={open}>
            <DropdownMenuTrigger asChild>
              <div ref={setNodeRef} style={style} className="flex items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => jump2View(view.id)}
                  className={cn({
                    "opacity-60": !isActive,
                    "border-b-2 border-primary rounded-b-none": isActive,
                    "animate-border-flicker": loading,
                  })}
                >
                  <div className="flex items-center gap-1">
                    <div
                      {...attributes}
                      {...listeners}
                      className="flex items-center"
                    >
                      <ViewIcon 
                        viewType={view.type} 
                        className="h-4 w-4 cursor-grab active:cursor-grabbing"
                        showCursor={true}
                      />
                    </div>
                    <span className="select-none">{view.name}</span>
                  </div>
                </Button>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={handleEdit} disabled={isReadOnly}>
                {t("table.view.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={disabledDelete || isReadOnly}>
                <DialogTrigger className="flex w-full cursor-default">
                  {t("common.delete")}
                </DialogTrigger>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("table.view.deleteConfirmTitle")}</DialogTitle>
              <DialogDescription>
                {t("table.view.deleteConfirmDescription")}
              </DialogDescription>
              <DialogFooter>
                <Button
                  variant="secondary"
                  onClick={() => setDeleteDialogOpen(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button variant="destructive" onClick={deleteView}>
                  {t("common.delete")}
                </Button>
              </DialogFooter>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      ) : (
        <div ref={setNodeRef} style={style} className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => jump2View(view.id)}
            className={cn({
              "opacity-60": !isActive,
              "border-b-2 border-primary rounded-b-none": isActive,
              "animate-border-flicker": loading,
            })}
          >
            <div className="flex items-center gap-1">
              <div {...attributes} {...listeners} className="flex items-center">
                <ViewIcon 
                  viewType={view.type} 
                  className="h-4 w-4 cursor-grab active:cursor-grabbing"
                  showCursor={true}
                />
              </div>
              <span className="select-none">{view.name}</span>
            </div>
          </Button>
        </div>
      )}
    </>
  )
}
