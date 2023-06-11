import { create } from "zustand"
import { persist } from "zustand/middleware"

import { AIConfigFormValues } from "@/app/settings/ai/ai-form"
import { ExperimentFormValues } from "@/app/settings/experiment/experiment-form"

interface ConfigState {
  aiConfig: AIConfigFormValues
  experiment: ExperimentFormValues
  setAiConfig: (aiConfig: AIConfigFormValues) => void
  setExperiment: (experiment: ExperimentFormValues) => void
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      aiConfig: {
        token: "",
        autoRunScope: [],
      },
      experiment: {
        undoRedo: false,
        aiChat: false,
      },
      setAiConfig: (aiConfig) => set({ aiConfig }),
      setExperiment: (experiment) => set({ experiment }),
    }),
    {
      name: "settings-config",
      getStorage: () => localStorage,
    }
  )
)
