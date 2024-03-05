import { useState } from "react"

import { Loading } from "@/components/loading"

import { useWebGPUWhisper } from "./hooks"
import { MicButton } from "./recorder"

interface IWhisperProps {
  setText: (text: string) => void
}

export const Whisper = ({ setText }: IWhisperProps) => {
  const [loading, setLoading] = useState(false)
  const { runWhisper, hasWebGPU } = useWebGPUWhisper({ setText, setLoading })
  // const { runWhisper } = useCloudflareWhisper()
  if (!hasWebGPU) {
    return null
  }
  return (
    <>
      {loading && <Loading />}
      <MicButton setAudioData={runWhisper} />
    </>
  )
}
