import { create } from "zustand"
import { persist } from "zustand/middleware"

import { uuidv4 } from "@/lib/utils"
import { AIConfigFormValues } from "@/app/settings/ai/ai-form"
import { BackupServerFormValues } from "@/app/settings/backup/page"

import { ProfileFormValues } from "./profile-form"

interface ConfigState {
  aiConfig: AIConfigFormValues
  setAiConfig: (aiConfig: AIConfigFormValues) => void
  profile: ProfileFormValues
  setProfile: (profile: ProfileFormValues) => void

  backupServer: BackupServerFormValues
  setBackupServer: (backupServer: BackupServerFormValues) => void
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      aiConfig: {
        baseUrl: "https://api.openai.com/v1",
        token: "",
        OPENAI_MODELS:
          "gpt-3.5-turbo-1106, gpt-4-1106-preview, gpt-4-vision-preview",
        // google
        GOOGLE_API_KEY: "",
        GOOGLE_MODELS: "gemini-pro",
        // groq
        GROQ_BASE_URL: "https://api.groq.com/openai/v1",
        GROQ_API_KEY: "",
        GROQ_MODELS: "llama2-70b-4096, mixtral-8x7b-32768",
        autoRunScope: [],
        localModels: [],
        autoLoadEmbeddingModel: false,
      },
      profile: {
        username: "",
        userId: uuidv4(),
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
      setAiConfig: (aiConfig) => set({ aiConfig }),
      setProfile: (profile) =>
        set((state) => {
          if (!state.profile.userId) {
            profile.userId = uuidv4()
          }
          return { ...state, profile }
        }),
      setBackupServer: (backupServer) => set({ backupServer }),
    }),
    {
      name: "settings-config",
      getStorage: () => localStorage,
    }
  )
)
