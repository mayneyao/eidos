import { create } from "zustand"
import { persist } from "zustand/middleware"

import { AIConfigFormValues } from "./ai/ai-form"

interface ConfigState {
  aiConfig: AIConfigFormValues
  setAiConfig: (aiConfig: AIConfigFormValues) => void
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      aiConfig: {
        token: "",
        autoRunScope: [],
      },
      setAiConfig: (aiConfig) => set({ aiConfig }),
    }),
    {
      name: "settings-config",
      getStorage: () => localStorage,
    }
  )
)
