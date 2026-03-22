import React, { useEffect } from "react"
import { ChevronsUpDown } from "lucide-react"

import { ViewTypeEnum } from "@/packages/core/types/IView"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

import { Button } from "../../ui/button"
import { DocListViewProperties } from "../views/doc-list/properties"
import { GalleryViewProperties } from "../views/gallery/properties"
import { GridViewProperties } from "../views/grid/properties"
import { KanbanViewProperties } from "../views/kanban/properties"

export const ViewLayout = (props: {
  icon: React.FC
  viewType: ViewTypeEnum
  viewId: string
  title: string
  isActive?: boolean
  disabled?: boolean
  onClick?: () => void
}) => {
  const [open, setOpen] = React.useState(false)
  const [isFirstClick, setIsFirstClick] = React.useState(true)
  const { icon: Icon, viewType, viewId } = props

  useEffect(() => {
    if (!props.isActive) {
      setOpen(false)
    }
  }, [props.isActive])

  if (props.isActive) {
    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-col w-full">
          <div className="flex w-full items-center">
            <Button
              disabled={Boolean(props.disabled)}
              className="flex w-full justify-start gap-2"
              variant={props.isActive ? "secondary" : "outline"}
            >
              <div
                className="flex w-full items-center justify-between"
                onClick={(e) => {
                  e.stopPropagation()
                  if (isFirstClick) {
                    setIsFirstClick(false)
                  }
                  props.onClick?.()
                }}
              >
                <span className="flex items-center gap-2">
                  <Icon />
                  {props.title}
                </span>
                <CollapsibleTrigger asChild>
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpen(!open)
                    }}
                    className="p-1 px-2 rounded-xs cursor-pointer transition-colors ml-2"
                  >
                    <ChevronsUpDown className="h-4 w-4" />
                  </div>
                </CollapsibleTrigger>
              </div>
            </Button>
          </div>
        </div>
        <CollapsibleContent className="p-2">
          {viewType === ViewTypeEnum.Gallery && (
            <GalleryViewProperties viewId={viewId} />
          )}
          {viewType === ViewTypeEnum.Grid && <GridViewProperties />}
          {viewType === ViewTypeEnum.DocList && <DocListViewProperties />}
          {viewType === ViewTypeEnum.Kanban && (
            <KanbanViewProperties viewId={viewId} />
          )}
        </CollapsibleContent>
      </Collapsible>
    )
  }
  return (
    <Button
      disabled={Boolean(props.disabled)}
      onClick={props.onClick}
      className="flex w-full justify-start gap-2"
      variant={props.isActive ? "secondary" : "outline"}
    >
      <>
        <Icon />
        {props.title}
      </>
    </Button>
  )
}
