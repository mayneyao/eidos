import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export type FileSpaceBaseTemplate = "blank" | "tasks"
export type FileSpaceBaseAssetFolder = "space-assets" | "base-folder-assets"

export interface FileSpaceSettings {
  showHiddenFiles: boolean
  showObsidianFolder: boolean
  defaultBaseTemplate: FileSpaceBaseTemplate
  baseAssetFolder: FileSpaceBaseAssetFolder
}

export const DEFAULT_FILE_SPACE_SETTINGS: FileSpaceSettings = {
  showHiddenFiles: false,
  showObsidianFolder: false,
  defaultBaseTemplate: "blank",
  baseAssetFolder: "space-assets",
}

interface FileSpaceSettingsState {
  bySpace: Record<string, FileSpaceSettings>
  getSettings: (spaceId: string) => FileSpaceSettings
  updateSettings: (spaceId: string, updates: Partial<FileSpaceSettings>) => void
}

export const useFileSpaceSettings = create<FileSpaceSettingsState>()(
  persist(
    (set, get) => ({
      bySpace: {},
      getSettings: (spaceId) => ({
        ...DEFAULT_FILE_SPACE_SETTINGS,
        ...get().bySpace[spaceId],
      }),
      updateSettings: (spaceId, updates) =>
        set((state) => ({
          bySpace: {
            ...state.bySpace,
            [spaceId]: {
              ...DEFAULT_FILE_SPACE_SETTINGS,
              ...state.bySpace[spaceId],
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
