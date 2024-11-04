import { useMemo } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getNodeByKey, NodeKey } from "lexical"

import { getBlockIdFromUrl, getBlockUrl } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { BlockApp } from "@/components/block-renderer/block-app"

import { useEditorInstance } from "../../hooks/editor-instance-context"
import { useResizable } from "./hooks/use-resizable"
import { $isCustomBlockNode } from "./node"

function CustomBlockPlaceholderComponent(props: { nodeKey: string }) {
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

  const CustomBlockPlaceholder = useMemo(() => {
    if (!props.url.length) {
      return <CustomBlockPlaceholderComponent nodeKey={props.nodeKey} />
    }
    return null
  }, [props.url, props.nodeKey])

  const { height, handleMouseDown } = useResizable({
    initialHeight: props.height || 300,
    nodeKey: props.nodeKey,
    editor,
    isSelecting,
  })

  const currentBlock = useMemo(
    () => mblocks.find((mblock) => mblock.id === getBlockIdFromUrl(props.url)),
    [mblocks, props.url]
  )

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
      <BlockApp url={props.url} />
      <div
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize bg-transparent hover:bg-gray-200 transition-colors"
        onMouseDown={handleMouseDown}
      />
    </div>
  )
}
