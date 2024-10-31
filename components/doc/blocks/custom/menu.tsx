import { useState } from "react"
import { $getNodeByKey, LexicalEditor, NodeKey } from "lexical"
import { AudioWaveform } from "lucide-react"

import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

import { $isCustomBlockNode } from "./node"

export const CustomBlockMenu = ({
  nodeKey,
  editor,
}: {
  nodeKey: NodeKey | null
  editor: LexicalEditor
}) => {
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState("")

  const handleSelect = async () => {
    editor.update(() => {
      if (!nodeKey) return
      const node = $getNodeByKey(nodeKey)
    })
  }
  return (
    <DropdownMenuItem onSelect={handleSelect}>
      <AudioWaveform className="mr-2 h-4 w-4"></AudioWaveform>
      <span>Transcript</span>
    </DropdownMenuItem>
  )
}
