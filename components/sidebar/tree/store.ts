import { create } from "zustand"

// Define the state shape
interface FolderState {
  folders: Record<string, boolean>
  toggleFolder: (id: string) => void
  closeFolder: (id: string) => void
  currentCut: string | null
  setCut: (id: string | null) => void
}

// Create the Zustand store
export const useFolderStore = create<FolderState>((set) => ({
  currentCut: null,
  setCut: (id: string | null) =>
    set(() => ({
      currentCut: id,
    })),
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
}))
