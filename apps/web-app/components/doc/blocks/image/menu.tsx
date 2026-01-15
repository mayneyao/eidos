import type { LexicalEditor, NodeKey } from "lexical"
import { $getNodeByKey } from "lexical"
import { AppWindowIcon, ClipboardCopyIcon } from "lucide-react"

import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/use-toast"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

import { $isImageNode } from "./node"

export const ImageMenu = ({
  nodeKey,
  editor,
}: {
  nodeKey: NodeKey | null
  editor: LexicalEditor
}) => {
  const { toast } = useToast()
  const { navigate } = useRouterAdapter()

  const handleCopyUrl = async () => {
    editor.update(() => {
      if (!nodeKey) return
      const node = $getNodeByKey(nodeKey)
      if ($isImageNode(node)) {
        let url = node.__src
        if (url.startsWith("http")) {
          navigator.clipboard.writeText(url)
        } else {
          navigator.clipboard.writeText(`${window.location.origin}${url}`)
        }
        toast({
          title: "Copied to clipboard",
          description: "You can paste it anywhere",
        })
      }
    })
  }

  const handleOpenInFileHandler = () => {
    editor.getEditorState().read(() => {
      if (!nodeKey) return
      const node = $getNodeByKey(nodeKey)
      if ($isImageNode(node)) {
        let filePath = node.__src
        // Convert /files/ paths to ~/.eidos/files/ format for file-handler
        if (filePath.startsWith("/files/")) {
          filePath = "~/.eidos" + filePath
        }
        // Navigate to file-handler page with file path in hash
        navigate(`/file-handler#${filePath}`)
      }
    })
  }

  if (!nodeKey) return null
  return (
    <>
      <DropdownMenuItem onSelect={handleCopyUrl}>
        <ClipboardCopyIcon className="w-4 h-4 mr-2" />
        <span>Copy URL</span>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={handleOpenInFileHandler}>
        <AppWindowIcon className="w-4 h-4 mr-2" />
        <span>Open in File Handler</span>
      </DropdownMenuItem>
    </>
  )
}
