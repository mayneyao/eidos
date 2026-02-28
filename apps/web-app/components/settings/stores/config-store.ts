import { create } from "zustand"
import { persist } from "zustand/middleware"

import { uuidv7 } from "@/lib/utils"
// Define BackupServerFormValues locally since we're moving away from the old structure
export interface BackupServerFormValues {
  Github__repo: string
  Github__token: string
  Github__enabled: boolean
  S3__endpointUrl: string
  S3__accessKeyId: string
  S3__secretAccessKey: string
  autoSaveGap: number
}

// Define ProfileFormValues locally since we're moving away from the old structure
export interface ProfileFormValues {
  username: string
  userId: string
  avatar?: string
}

export interface ApiKey {
  id: string
  name: string
  value: string
  createdAt: string // Optional: for sorting or display
}

interface ConfigState {
  profile: ProfileFormValues
  setProfile: (profile: ProfileFormValues) => void

  backupServer: BackupServerFormValues
  setBackupServer: (backupServer: BackupServerFormValues) => void
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      profile: {
        username: "",
        userId: uuidv7(),
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
      setProfile: (profile) =>
        set((state) => {
          if (!state.profile.userId) {
            profile.userId = uuidv7()
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
