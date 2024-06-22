import { create } from "zustand"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { persist } from "zustand/middleware"

export interface IHoverTarget extends ITreeNode {
  index: number
  direction: "up" | "down"
  depth: number
}
// Define the state shape
interface FolderState {
  currentCut: string | null
  setCut: (id: string | null) => void
  targetFolderId: string | null
  setTargetFolderId: (id: string | null) => void
  target: IHoverTarget | null
  setTarget: (target: IHoverTarget | null) => void
}

export const useFolderStore = () => {
  const folderActionStore = useFolderActionStore()
  const folderPersistStore = usePersistFolderStore()
  return {
    ...folderActionStore,
    ...folderPersistStore,
  }
}

// Create the Zustand store
export const useFolderActionStore = create<FolderState>((set) => ({
  targetFolderId: null,
  target: null,
  setTarget: (target) =>
    set((state) => {
      return {
        target,
        targetFolderId: target ? null : state.targetFolderId,
      }
    }),
  setTargetFolderId: (id: string | null) =>
    set(() => ({
      targetFolderId: id,
    })),
  currentCut: null,
  setCut: (id: string | null) =>
    set(() => ({
      currentCut: id,
    })),
}))

export const usePersistFolderStore = create<{
  folders: Record<string, boolean>
  toggleFolder: (id: string) => void
  closeFolder: (id: string) => void
}>()(persist(
  (set) => ({

    folders: {},
    toggleFolder: (id: string) =>
      set((state) => ({
        folders: {
          ...state.folders,
          [id]: !state.folders[id],
        },
      })),
    closeFolder: (id: string) =>
      set((state) => ({
        folders: {
          ...state.folders,
          [id]: false,
        },
      })),
  }), {
  name: "folder-persist",
  getStorage: () => localStorage,
  }
))
