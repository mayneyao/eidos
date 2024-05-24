import { useRef, useState } from "react"
import { useVirtualList } from "ahooks"

import { IView } from "@/lib/store/IView"
import { cn, shortenId } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { NodeComponent } from "@/app/[database]/[node]/page"

import { useGalleryViewData } from "../gallery/hooks"

interface IDocListViewProps {
  space: string
  tableName: string
  view: IView
}

export function DocListView(props: IDocListViewProps) {
  const [nodeId, setNodeId] = useState<string>()
  const { list: originalList } = useGalleryViewData(props.view)
  const containerRef = useRef(null)
  const wrapperRef = useRef(null)
  const [list] = useVirtualList(originalList, {
    containerTarget: containerRef,
    wrapperTarget: wrapperRef,
    itemHeight: 36,
    overscan: 10,
  })

  return (
    <div className="flex h-full gap-4 p-2">
      <ScrollArea
        className={cn("h-full w-[350px]  overflow-y-auto border-r")}
        ref={containerRef}
      >
        <div ref={wrapperRef} className={`h-full`}>
          {list.map((item, index) => (
            <Button
              key={item.data._id}
              variant={
                shortenId(item.data._id) === nodeId ? "secondary" : "ghost"
              }
              size="sm"
              className="w-full justify-start truncate font-normal"
              onClick={() => setNodeId(shortenId(item.data._id))}
            >
              {item.data.title || "Untitled"}
            </Button>
          ))}
        </div>
      </ScrollArea>
      <ScrollArea className="h-full grow overflow-y-auto">
        {nodeId ? (
          <NodeComponent nodeId={nodeId} />
        ) : (
          <h1 className=" mt-32 text-center">Select a document</h1>
        )}
      </ScrollArea>
    </div>
  )
}
