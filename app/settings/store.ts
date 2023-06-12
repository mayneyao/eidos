import { create } from "zustand"
import { persist } from "zustand/middleware"

import { AIConfigFormValues } from "@/app/settings/ai/ai-form"
import { ExperimentFormValues } from "@/app/settings/experiment/experiment-form"

import { ProfileFormValues } from "./profile-form"

interface ConfigState {
  aiConfig: AIConfigFormValues
  experiment: ExperimentFormValues
  setAiConfig: (aiConfig: AIConfigFormValues) => void
  setExperiment: (experiment: ExperimentFormValues) => void
  profile: ProfileFormValues
  setProfile: (profile: ProfileFormValues) => void
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
      profile: {
        username: "",
      },
      setAiConfig: (aiConfig) => set({ aiConfig }),
      setExperiment: (experiment) => set({ experiment }),
      setProfile: (profile) => set({ profile }),
    }),
    {
      name: "settings-config",
      getStorage: () => localStorage,
    }
  )
)
