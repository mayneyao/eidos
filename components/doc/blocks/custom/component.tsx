import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getNodeByKey, NodeKey } from "lexical"
import { useCallback, useRef, useState } from "react"

import { BlockApp } from "@/components/block-renderer/block-app"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { getBlockIdFromUrl, getBlockUrl } from "@/lib/utils"

import { useEditorInstance } from "../../hooks/editor-instance-context"
import { $isCustomBlockNode } from "./node"

function CustomBlockPlaceholder(props: { nodeKey: string }) {
  const { nodeKey } = props
  const [editor] = useLexicalComposerContext()
  const { mblocks } = useEditorInstance()

  const handleSelect = async (url: string) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isCustomBlockNode(node)) {
        node.setUrl(url)
      }
    })
  }

  return (
    <Popover>
      <PopoverTrigger className="w-full">
        <div className="flex h-[70px] w-full items-center justify-center bg-gray-200">
          <div className="text-center">
            <div className="text-sm text-gray-500">Add A CustomBlock</div>
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2 max-h-[300px] overflow-y-auto">
        {mblocks.map((mblock) => (
          <div
            key={mblock.id}
            onClick={() => handleSelect(getBlockUrl(mblock.id))}
            className="px-4 py-2 hover:bg-gray-100 cursor-pointer rounded-md transition-colors duration-200 flex items-center gap-2"
          >
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-sm text-gray-700">{mblock.name}</span>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}

export const CustomBlockComponent = (props: {
  url: string
  nodeKey: NodeKey
  height?: number
}) => {
  const [editor] = useLexicalComposerContext()
  const { mblocks, isSelecting } = useEditorInstance()
  const [height, setHeight] = useState<number>(props.height || 300)
  const isDragging = useRef(false)
  const startY = useRef(0)
  const startHeight = useRef(0)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return

    const deltaY = e.clientY - startY.current
    const newHeight = Math.max(100, startHeight.current + deltaY)
    setHeight(newHeight)
  }, [])

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current) return

      editor.update(() => {
        const node = $getNodeByKey(props.nodeKey)
        if ($isCustomBlockNode(node)) {
          node.setHeight(height)
        }
      })

      isDragging.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)

      const overlay = document.getElementById("drag-overlay")
      overlay?.remove()
    },
    [handleMouseMove, height, editor, props.nodeKey]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isSelecting) return
      e.preventDefault()

      isDragging.current = true
      startY.current = e.clientY
      startHeight.current = height

      document.body.style.cursor = "ns-resize"
      document.body.style.userSelect = "none"

      const overlay = document.createElement("div")
      overlay.id = "drag-overlay"
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 9999;
      `
      document.body.appendChild(overlay)

      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
    },
    [height, handleMouseMove, handleMouseUp, isSelecting]
  )

  if (!props.url.length) {
    return <CustomBlockPlaceholder nodeKey={props.nodeKey} />
  }

  const mblock = mblocks.find(
    (mblock) => mblock.id === getBlockIdFromUrl(props.url)
  )

  if (!mblock) {
    return (
      <div className="w-full h-fit border border-gray-200 rounded-lg p-4">
        <div className="text-center text-sm text-gray-500">
          Custom block Not Found, maybe it's disabled or deleted
        </div>
      </div>
    )
  }

  return (
    <div
      className="w-full border border-gray-200 rounded-lg p-2 relative"
      style={{
        height: `${height}px`,
        pointerEvents: isSelecting ? "none" : "auto",
      }}
    >
      <BlockApp url={props.url} />
      <div
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize bg-transparent hover:bg-gray-200 transition-colors"
        onMouseDown={handleMouseDown}
      />
    </div>
  )
}
