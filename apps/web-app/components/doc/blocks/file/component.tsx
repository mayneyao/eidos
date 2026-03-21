import { useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import type { NodeKey } from "lexical"
import { $getNodeByKey } from "lexical"
import { File, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FinderDialog } from "@/components/finder"

import { $isFileNode } from "./node"

function FilePlaceholder(props: { nodeKey: string }) {
  const { nodeKey } = props
  const [editor] = useLexicalComposerContext()
  const [open, setOpen] = useState(false)

  const handleSelect = (paths: string[]) => {
    if (paths.length > 0) {
      const url = paths[0]
      const fileName = url.split("/").pop() || ""
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isFileNode(node)) {
          node.setSrc(url)
          node.setFileName(fileName)
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
          <Upload className="h-4 w-4" />
          <span className="text-sm">Add a file</span>
        </div>
      </Button>
      <FinderDialog
        open={open}
        onOpenChange={setOpen}
        title="Select File"
        confirmLabel="Select"
        onSelect={handleSelect}
        selectMode="file"
        allowMultiple={false}
      />
    </>
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
    <div className="flex items-center p-2 rounded-lg bg-muted/50 hover:bg-muted border border-border">
      <File className="mr-3 h-5 w-5 text-primary flex-shrink-0" />
      <a
        href={url}
        download={fileName}
        className="text-sm font-medium hover:underline truncate"
        title={fileName}
      >
        {fileName}
      </a>
    </div>
  )
}
