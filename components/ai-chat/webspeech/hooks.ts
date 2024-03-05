import { create } from "zustand"

import { useAIChatSettingsStore } from "../settings/ai-chat-settings-store"

type ISpeakStore = {
  msgId: string
  charIndex: number
  charLength: number
  setSpeakRange: (charIndex: number, charLength: number) => void
  setMsgId: (msgId: string) => void
}
export const useSpeakStore = create<ISpeakStore>((set) => ({
  msgId: "",
  charIndex: 0,
  charLength: 0,
  setSpeakRange: (charIndex, charLength) => set({ charIndex, charLength }),
  setMsgId: (msgId) => set({ msgId }),
}))

export const useSpeak = () => {
  const { voiceURI, pitch, rate } = useAIChatSettingsStore()
  const { setSpeakRange, setMsgId } = useSpeakStore()

  const speak = (text: string, id?: string) => {
    const synth = window.speechSynthesis
    const voices = synth.getVoices()

    if (synth.speaking) {
      console.error("speechSynthesis.speaking")
      return
    }
    if (id) {
      setMsgId(id)
    }

    if (text !== "") {
      const utterThis = new SpeechSynthesisUtterance(text)
      const voice = voices.find((voice) => voice.voiceURI === voiceURI)!
      utterThis.voice = voice
      utterThis.pitch = pitch
      utterThis.rate = rate
      utterThis.onend = function (event) {
        console.log("SpeechSynthesisUtterance.onend")
        setSpeakRange(0, 0)
        setMsgId("")
      }
      utterThis.onpause = function (event) {
        console.log("SpeechSynthesisUtterance.onpause")
      }

      utterThis.onerror = function (event) {
        console.error("SpeechSynthesisUtterance.onerror")
        setSpeakRange(0, 0)
      }
      utterThis.onmark = function (event) {}
      utterThis.onboundary = function (event) {
        setSpeakRange(event.charIndex, event.charLength)
      }

      synth.speak(utterThis)
    }
  }

  const cancel = () => {
    window.speechSynthesis.cancel()
    setSpeakRange(0, 0)
    setMsgId("")
  }

  return {
    speak,
    cancel,
  }
}
