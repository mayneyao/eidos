import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { uuidv7 } from "@/lib/utils"

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
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      profile: {
        username: "",
        userId: uuidv7(),
      },
      setProfile: (profile) =>
        set((state) => {
          if (!state.profile.userId) {
            profile.userId = uuidv7()
          }
          return { ...state, profile }
        }),
    }),
    {
      name: "settings-config",
      storage: createJSONStorage(() => localStorage),
    }
  )
)
