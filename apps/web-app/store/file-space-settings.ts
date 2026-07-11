import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export interface FileSpaceViewSettings {
  showHiddenFiles: boolean
  showObsidianFolder: boolean
}

const DEFAULT_SETTINGS: FileSpaceViewSettings = {
  showHiddenFiles: false,
  showObsidianFolder: false,
}

interface FileSpaceSettingsState {
  bySpace: Record<string, FileSpaceViewSettings>
  getSettings: (spaceId: string) => FileSpaceViewSettings
  updateSettings: (
    spaceId: string,
    updates: Partial<FileSpaceViewSettings>
  ) => void
}

export const useFileSpaceSettings = create<FileSpaceSettingsState>()(
  persist(
    (set, get) => ({
      bySpace: {},
      getSettings: (spaceId) => get().bySpace[spaceId] ?? DEFAULT_SETTINGS,
      updateSettings: (spaceId, updates) =>
        set((state) => ({
          bySpace: {
            ...state.bySpace,
            [spaceId]: {
              ...(state.bySpace[spaceId] ?? DEFAULT_SETTINGS),
              ...updates,
            },
          },
        })),
    }),
    {
      name: "eidos:file-space:view-settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ bySpace: state.bySpace }),
    }
  )
)
