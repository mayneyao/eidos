import { useState } from "react"

import { Loading } from "@/components/loading"

import { useWebGPUWhisper } from "./hooks"
import { MicButton } from "./recorder"

interface IWhisperProps {
  setText: (text: string) => void
}

export const Whisper = ({ setText }: IWhisperProps) => {
  const [loading, setLoading] = useState(false)
  const { runWhisper } = useWebGPUWhisper({ setText, setLoading })
  // const { runWhisper } = useCloudflareWhisper()

  return (
    <>
      {loading && <Loading />}
      <MicButton
        setBlobUrl={console.log}
        setAudioData={runWhisper}
        setAudioMetadata={console.log}
      />
    </>
  )
}
