import { useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getNodeByKey, NodeKey } from "lexical"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { FileSelector } from "@/components/file-selector"
import { Loading } from "@/components/loading"

import { $isAudioNode } from "./node"

function AudioPlaceholder(props: { nodeKey: string }) {
  const { nodeKey } = props
  const [editor] = useLexicalComposerContext()
  const [loading, setLoading] = useState(false)

  const handleSelect = async (url: string) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isAudioNode(node)) {
        node.setSrc(url)
      }
    })
  }

  return (
    <Popover>
      <PopoverTrigger className="w-full">
        <div className="flex h-[70px] w-full items-center justify-center bg-gray-200">
          <div className="text-center">
            {loading ? (
              <Loading />
            ) : (
              <div className="text-sm text-gray-500">Add an audio file</div>
            )}
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <FileSelector
          onSelected={handleSelect}
          onRemove={() => {}}
          disableColor
          hideRemove
          hideGallery
          height={300}
        />
      </PopoverContent>
    </Popover>
  )
}

export const AudioComponent = (props: { url: string; nodeKey: NodeKey }) => {
  if (!props.url.length) {
    return <AudioPlaceholder nodeKey={props.nodeKey} />
  }
  return (
    <audio className="w-full" controls preload="none" src={props.url}></audio>
  )
}
