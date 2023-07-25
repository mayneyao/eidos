import { create } from "zustand"
import { persist } from "zustand/middleware"

import { AIConfigFormValues } from "@/app/settings/ai/ai-form"
import { BackupServerFormValues } from "@/app/settings/backup/page"
import { ExperimentFormValues } from "@/app/settings/experiment/experiment-form"

import { ProfileFormValues } from "./profile-form"

interface ConfigState {
  aiConfig: AIConfigFormValues
  experiment: ExperimentFormValues
  setAiConfig: (aiConfig: AIConfigFormValues) => void
  setExperiment: (experiment: ExperimentFormValues) => void
  profile: ProfileFormValues
  setProfile: (profile: ProfileFormValues) => void

  backupServer: BackupServerFormValues
  setBackupServer: (backupServer: BackupServerFormValues) => void
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
      backupServer: {
        url: "",
        token: "",
        autoSaveGap: 10,
      },
      setAiConfig: (aiConfig) => set({ aiConfig }),
      setExperiment: (experiment) => set({ experiment }),
      setProfile: (profile) => set({ profile }),
      setBackupServer: (backupServer) => set({ backupServer }),
    }),
    {
      name: "settings-config",
      getStorage: () => localStorage,
    }
  )
)
