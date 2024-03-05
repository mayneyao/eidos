import { useState } from "react"
import { MicRecorder } from "whisper-turbo"

import { Button } from "@/components/ui/button"

const SAMPLE_RATE = 16000

interface MicButtonProps {
  setBlobUrl: (blobUrl: string) => void
  setAudioData: (audioData: Uint8Array) => void
  setAudioMetadata: (audioMetadata: AudioMetadata) => void
}

export interface AudioMetadata {
  file: File
  fromMic: boolean
}

export const MicButton = (props: MicButtonProps) => {
  const [mic, setMic] = useState<MicRecorder | null>(null)
  const [isRecording, setIsRecording] = useState(false)

  const handleRecord = async () => {
    setMic(await MicRecorder.start())
  }

  const handleStop = async () => {
    if (!mic) {
      return
    }
    let recording = await mic.stop()
    let ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    let resampled = await ctx.decodeAudioData(recording.buffer)
    let ch0 = resampled.getChannelData(0)
    props.setAudioData(new Uint8Array(ch0.buffer))

    let blob = recording.blob
    props.setAudioMetadata({
      file: new File([blob], "recording.wav"),
      fromMic: true,
    })
    props.setBlobUrl(URL.createObjectURL(blob))
    setMic(null)
  }

  const handleClick = async () => {
    if (isRecording) {
      await handleStop()
    } else {
      await handleRecord()
    }
    setIsRecording(!isRecording)
  }

  return (
    <Button onClick={handleClick} variant="ghost" size="sm">
      {isRecording ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-5 w-5"
        >
          <path
            fillRule="evenodd"
            d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
          />
        </svg>
      )}
    </Button>
  )
}
