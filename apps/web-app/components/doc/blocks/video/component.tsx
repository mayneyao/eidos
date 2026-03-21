import { useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import type { NodeKey } from "lexical"
import { $getNodeByKey } from "lexical"
import { Video, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FinderDialog } from "@/components/finder"

import { $isVideoNode } from "./node"

function VideoPlaceholder(props: { nodeKey: string }) {
  const { nodeKey } = props
  const [editor] = useLexicalComposerContext()
  const [open, setOpen] = useState(false)

  const handleSelect = (paths: string[]) => {
    if (paths.length > 0) {
      const url = paths[0]
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isVideoNode(node)) {
          node.setSrc(url)
        }
      })
    }
    setOpen(false)
  }

  return (
    <>
      <Button
        variant="ghost"
        className="h-[70px] w-full border-2 border-dashed border-border bg-muted/50 hover:bg-muted"
        onClick={() => setOpen(true)}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <Video className="h-4 w-4" />
          <span className="text-sm">Add a video file</span>
        </div>
      </Button>
      <FinderDialog
        open={open}
        onOpenChange={setOpen}
        title="Select Video"
        confirmLabel="Select"
        onSelect={handleSelect}
        selectMode="file"
        allowMultiple={false}
        accept="video/*"
      />
    </>
  )
}

export const VideoComponent = (props: { url: string; nodeKey: NodeKey }) => {
  if (!props.url.length) {
    return <VideoPlaceholder nodeKey={props.nodeKey} />
  }
  return (
    <video className="w-full rounded-lg" controls preload="metadata">
      <source src={props.url} />
    </video>
  )
}
