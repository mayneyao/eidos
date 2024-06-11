import { useMemo, useRef, useState } from "react"
import { useVirtualList } from "ahooks"

import { IView } from "@/lib/store/IView"
import { cn, shortenId } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  const [query, setQuery] = useState("")
  const { list: originalList } = useGalleryViewData(props.view)
  const containerRef = useRef(null)
  const wrapperRef = useRef(null)

  const filteredList = useMemo(() => {
    if (!query) return originalList
    return originalList.filter((item) =>
      item.title?.toLowerCase().includes(query.toLowerCase())
    )
  }, [originalList, query])

  const [list] = useVirtualList(filteredList, {
    containerTarget: containerRef,
    wrapperTarget: wrapperRef,
    itemHeight: 36,
    overscan: 10,
  })

  return (
    <div className="flex h-full shrink-0 gap-4 p-2">
      <ScrollArea
        className={cn(" h-full  w-[300px] overflow-y-auto border-r")}
        ref={containerRef}
      >
        <div className="w-full p-2">
          <Input
            className="focus-visible:ring-0"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div ref={wrapperRef} className="h-full w-[300px] p-2">
          {list.map((item, index) => (
            <Button
              key={item.data._id}
              variant={
                shortenId(item.data._id) === nodeId ? "secondary" : "ghost"
              }
              size="sm"
              onClick={() => setNodeId(shortenId(item.data._id))}
            >
              <p
                className="w-[270px] truncate text-start font-normal"
                title={item.data.title || "Untitled"}
              >
                {item.data.title || "Untitled"}
              </p>
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
