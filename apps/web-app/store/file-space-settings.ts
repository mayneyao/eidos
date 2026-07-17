import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export type FileSpaceEidosFileTemplate = "blank" | "tasks"
export type FileSpaceEidosFileAssetFolder =
  | "space-assets"
  | "eidos-file-folder-assets"

export interface FileSpaceSettings {
  showHiddenFiles: boolean
  showObsidianFolder: boolean
  defaultEidosFileTemplate: FileSpaceEidosFileTemplate
  eidosFileAssetFolder: FileSpaceEidosFileAssetFolder
}

export const DEFAULT_FILE_SPACE_SETTINGS: FileSpaceSettings = {
  showHiddenFiles: false,
  showObsidianFolder: false,
  defaultEidosFileTemplate: "blank",
  eidosFileAssetFolder: "space-assets",
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
