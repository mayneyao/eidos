import { create } from "zustand"
import { persist } from "zustand/middleware"

import { AIConfigFormValues } from "@/app/settings/ai/ai-form"
import { BackupServerFormValues } from "@/app/settings/backup/page"
import { ExperimentFormValues } from "@/app/settings/experiment/experiment-form"

import { APIAgentFormValues } from "./api/page"
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

  apiAgentConfig: APIAgentFormValues
  setAPIAgentConfig: (apiAgentConfig: APIAgentFormValues) => void
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      aiConfig: {
        token: "",
        GOOGLE_API_KEY: "",
        baseUrl: "https://api.openai.com/v1",
        autoRunScope: [],
      },
      experiment: {
        undoRedo: false,
        aiChat: false,
        enableAICompletionInDoc: false,
        enableFileManager: false,
        enableTableLinkField: false,
      },
      profile: {
        username: "",
      },
      backupServer: {
        Github__repo: "",
        Github__token: "",
        Github__enabled: false,
        S3__endpointUrl: "",
        S3__accessKeyId: "",
        S3__secretAccessKey: "",
        autoSaveGap: 360,
      },
      apiAgentConfig: {
        url: "ws://localhost:3333",
        enabled: false,
      },
      setAPIAgentConfig: (apiAgentConfig) => set({ apiAgentConfig }),
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
