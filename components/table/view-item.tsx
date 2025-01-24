import { useContext, useState, useEffect } from "react"
import { LayoutGridIcon, LayoutListIcon, Table2Icon } from "lucide-react"
import ReactDOM from "react-dom"
import { useTranslation } from "react-i18next"
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

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
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { getLoading } = useViewLoadingStore()
  const loading = getLoading(view.query)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const { isReadOnly } = useContext(TableContext)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: view.id,
    animateLayoutChanges: () => false,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

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
              <div
                ref={setNodeRef}
                style={style}
                className="flex items-center"
              >
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
                      <Icon className="h-4 w-4 cursor-grab active:cursor-grabbing" />
                    </div>
                    <span className="select-none">{view.name}</span>
                  </div>
                </Button>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={handleEdit} disabled={isReadOnly}>
                {t('table.view.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={disabledDelete || isReadOnly}>
                <DialogTrigger className="flex w-full cursor-default">
                  {t('common.delete')}
                </DialogTrigger>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('table.view.deleteConfirmTitle')}</DialogTitle>
              <DialogDescription>
                {t('table.view.deleteConfirmDescription')}
              </DialogDescription>
              <DialogFooter>
                <Button
                  variant="secondary"
                  onClick={() => setDeleteDialogOpen(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button variant="destructive" onClick={deleteView}>
                  {t('common.delete')}
                </Button>
              </DialogFooter>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      ) : (
        <div
          ref={setNodeRef}
          style={style}
          className="flex items-center"
        >
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
                <Icon className="h-4 w-4 cursor-grab active:cursor-grabbing" />
              </div>
              <span className="select-none">{view.name}</span>
            </div>
          </Button>
        </div>
      )}
      {editDialogOpen &&
        ReactDOM.createPortal(
          <ViewEditor setEditDialogOpen={setEditDialogOpen} view={view} />,
          document.getElementById(TABLE_CONTENT_ELEMENT_ID)!
        )}
    </>
  )
}
