import { useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getNodeByKey, NodeKey } from "lexical"
import { File } from "lucide-react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { FileSelector } from "@/components/file-selector"
import { Loading } from "@/components/loading"

import { $isFileNode } from "./node"

function FilePlaceholder(props: { nodeKey: string }) {
  const { nodeKey } = props
  const [editor] = useLexicalComposerContext()
  const [loading, setLoading] = useState(false)

  const handleSelect = async (url: string) => {
    const fileName = url.split("/").pop()
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isFileNode(node)) {
        node.setSrc(url)
        node.setFileName(fileName ?? "")
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
              <div className="text-sm text-gray-500">Add a file</div>
            )}
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <FileSelector
          onSelected={(url) => handleSelect(url)}
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

export const FileComponent = ({
  url,
  fileName,
  nodeKey,
}: {
  url: string
  fileName: string
  nodeKey: NodeKey
}) => {
  if (!url.length || !fileName.length) {
    return <FilePlaceholder nodeKey={nodeKey} />
  }
  return (
    <div className="flex items-center p-1 rounded hover:bg-secondary">
      <File className="mr-2 h-5 w-5" />
      <a href={url} download={fileName}>
        {fileName}
      </a>
    </div>
  )
}
