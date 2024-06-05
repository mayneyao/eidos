import { create } from "zustand"

// Define the state shape
interface FolderOpenState {
  folders: Record<string, boolean>
  toggleFolder: (id: string) => void
  closeFolder: (id: string) => void
}

// Create the Zustand store
export const useFolderOpenStore = create<FolderOpenState>((set) => ({
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
