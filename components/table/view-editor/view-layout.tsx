import { ChevronsUpDown } from "lucide-react"

import { ViewTypeEnum } from "@/lib/store/IView"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

import { Button } from "../../ui/button"
import { DocListViewProperties } from "../views/doc-list/properties"
import { GalleryViewProperties } from "../views/gallery/properties"
import { GridViewProperties } from "../views/grid/properties"

export const ViewLayout = (props: {
  icon: React.FC
  viewType: ViewTypeEnum
  viewId: string
  title: string
  isActive?: boolean
  disabled?: boolean
  onClick?: () => void
}) => {
  const { icon: Icon, viewType, viewId } = props
  if (props.isActive) {
    return (
      <Collapsible>
        <Button
          disabled={Boolean(props.disabled)}
          onClick={props.onClick}
          className="flex w-full justify-start gap-2"
          variant={props.isActive ? "secondary" : "outline"}
        >
          <div className="flex w-full items-center justify-between">
            <span className="flex items-center gap-2">
              <Icon />
              {props.title}
            </span>
            <CollapsibleTrigger asChild>
              <ChevronsUpDown className="h-4 w-4" />
            </CollapsibleTrigger>
          </div>
        </Button>
        <CollapsibleContent className="p-2">
          {viewType === ViewTypeEnum.Gallery && (
            <GalleryViewProperties viewId={viewId} />
          )}
          {viewType === ViewTypeEnum.Grid && <GridViewProperties />}
          {viewType === ViewTypeEnum.DocList && <DocListViewProperties />}
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
