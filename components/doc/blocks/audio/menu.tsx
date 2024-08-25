import { useState } from "react"
import { $getNodeByKey, LexicalEditor, NodeKey } from "lexical"
import { AudioWaveform } from "lucide-react"

import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { useWebGPUWhisper } from "@/components/ai-chat/whisper/hooks"

import { $isAudioNode } from "./node"

export const AudioMenu = ({
  nodeKey,
  editor,
}: {
  nodeKey: NodeKey | null
  editor: LexicalEditor
}) => {
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState("")
  const { runWhisper, hasWebGPU, canUse } = useWebGPUWhisper({
    setText,
    setLoading,
  })

  const handleSelect = async () => {
    editor.update(() => {
      if (!nodeKey) return
      const node = $getNodeByKey(nodeKey)

      // FIXME: it's not working
      if ($isAudioNode(node)) {
        const getAudioData = async () => {
          const file = await fetch(node.__src).then((res) => res.blob())
          const arrayBuffer = await file.arrayBuffer()
          // Create an AudioContext
          const audioContext = new window.AudioContext()
          // Decode the audio data
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
          let ch0 = audioBuffer.getChannelData(0)
          runWhisper(new Uint8Array(ch0.buffer))
        }
        getAudioData()
      }
    })
  }
  return (
    <DropdownMenuItem onSelect={handleSelect}>
      <AudioWaveform className="mr-2 h-4 w-4"></AudioWaveform>
      <span>Transcript</span>
    </DropdownMenuItem>
  )
}
