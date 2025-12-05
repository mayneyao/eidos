import { useEffect, useRef } from "react"
import { useSize } from "ahooks"

import { BlockApp } from "@/components/block-renderer/block-app"
import { useMblock } from "@/apps/web-app/hooks/use-mblock"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

export default function BlockPage() {
  const { params, searchParams } = useRouterAdapter()
  const { id, database } = params

  const containerRef = useRef<HTMLDivElement>(null)
  const size = useSize(containerRef)
  const block = useMblock(id)
  useEffect(() => {
    if (block) {
      // set title
      document.title = `Eidos - ${block.name}`
    }
  }, [block])
  return (
    <div className="h-full w-full" ref={containerRef}>
      <BlockApp
        url={`block://${id}@${database}?${searchParams.toString()}`}
        height={size?.height}
      />
    </div>
  )
}
