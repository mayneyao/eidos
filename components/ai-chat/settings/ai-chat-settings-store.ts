import { create } from "zustand"
import { persist } from "zustand/middleware"

type AIChatSettingsStore = {
  voiceURI: string
  setVoiceURI: (voiceURI: string) => void
  pitch: number
  setPitch: (pitch: number) => void
  rate: number
  setRate: (rate: number) => void
}

export const useAIChatSettingsStore = create<AIChatSettingsStore>()(
  persist(
    (set) => ({
      voiceURI: "Microsoft Xiaoyi Online (Natural) - Chinese (Mainland)",
      setVoiceURI: (voiceURI) => set({ voiceURI }),
      pitch: 1,
      setPitch: (pitch) => set({ pitch }),
      rate: 1,
      setRate: (rate) => set({ rate }),
    }),
    {
      name: "ai-chat-settings-storage",
      getStorage: () => localStorage,
    }
  )
)
