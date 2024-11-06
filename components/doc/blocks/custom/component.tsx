import { useMemo, useRef } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getNodeByKey, NodeKey } from "lexical"
import { Link } from "react-router-dom"

import { getBlockIdFromUrl, getBlockUrl } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { BlockApp } from "@/components/block-renderer/block-app"
import type { BlockRendererRef } from "@/components/block-renderer/block-renderer"

import { useEditorInstance } from "../../hooks/editor-instance-context"
import { useResizable } from "./hooks/use-resizable"
import { $isCustomBlockNode } from "./node"

function CustomBlockPlaceholderComponent(props: { nodeKey: string }) {
  const { nodeKey } = props
  const [editor] = useLexicalComposerContext()
  const { mblocks } = useEditorInstance()
  const { space } = useCurrentPathInfo()

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
        {mblocks.length === 0 && (
          <p className="p-2 text-sm text-gray-500">
            There are no blocks in this space. Try to{" "}
            <Link
              to={`/${space}/extensions`}
              className="flex items-center gap-2 text-blue-500"
            >
              <span>create block</span>
            </Link>
          </p>
        )}
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
  const blockRef = useRef<BlockRendererRef>(null)
  const [editor] = useLexicalComposerContext()
  const { mblocks, isSelecting } = useEditorInstance()

  const CustomBlockPlaceholder = useMemo(() => {
    if (!props.url.length) {
      return <CustomBlockPlaceholderComponent nodeKey={props.nodeKey} />
    }
    return null
  }, [props.url, props.nodeKey])

  const { height, setHeight, handleMouseDown } = useResizable({
    initialHeight: props.height || 300,
    nodeKey: props.nodeKey,
    editor,
    isSelecting,
  })

  const currentBlock = useMemo(
    () => mblocks.find((mblock) => mblock.id === getBlockIdFromUrl(props.url)),
    [mblocks, props.url]
  )

  const handleHandlerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.altKey) {
      const height = blockRef.current?.getHeight()
      if (height) {
        const padding = 20
        const safeHeight = Math.max(height + padding, 100)
        editor.update(() => {
          const node = $getNodeByKey(props.nodeKey)
          if ($isCustomBlockNode(node)) {
            node.setHeight(safeHeight)
            setHeight(safeHeight)
            // setTimeout(() => {
            //   e.currentTarget.scrollIntoView({ behavior: "smooth" })
            // }, 300)
          }
        })
      }
    } else {
      handleMouseDown(e)
    }
  }

  if (!props.url.length) {
    return CustomBlockPlaceholder
  }

  if (!currentBlock) {
    return (
      <div className="w-full h-fit border border-gray-200 rounded-sm p-4">
        <div className="text-center text-sm text-gray-500">
          Custom block Not Found, maybe it's disabled or deleted
        </div>
      </div>
    )
  }

  return (
    <div
      className="w-full ring-1 ring-gray-200 rounded-sm p-2 relative"
      style={{
        height: `${height}px`,
        pointerEvents: isSelecting ? "none" : "auto",
      }}
    >
      <BlockApp ref={blockRef} url={props.url} />
      <Tooltip delayDuration={1000}>
        <TooltipTrigger asChild>
          <div
            role="resizable"
            className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize bg-transparent hover:bg-gray-200 transition-colors"
            onMouseDown={(e) => {
              handleHandlerMouseDown(e)
              const tooltipTrigger = e.currentTarget.parentElement
              if (tooltipTrigger) {
                tooltipTrigger.blur()
              }
            }}
          />
        </TooltipTrigger>
        <TooltipContent>
          Drag to resize, hold Alt/Option then click to auto fit content height
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
