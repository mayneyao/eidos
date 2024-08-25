import { $getNodeByKey, LexicalEditor, NodeKey } from "lexical"
import { ClipboardCopyIcon } from "lucide-react"

import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/use-toast"

import { $isFileNode } from "./node"

export const FileMenu = ({
  nodeKey,
  editor,
}: {
  nodeKey: NodeKey | null
  editor: LexicalEditor
}) => {
  const { toast } = useToast()
  const handleSelect = async () => {
    editor.update(() => {
      if (!nodeKey) return
      const node = $getNodeByKey(nodeKey)
      if ($isFileNode(node)) {
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
  if (!nodeKey) return null
  return (
    <DropdownMenuItem onSelect={handleSelect}>
      <ClipboardCopyIcon className="w-4 h-4 mr-2" />
      <span>Copy URL</span>
    </DropdownMenuItem>
  )
}
