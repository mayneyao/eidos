import { create } from "zustand"

import { ITreeNode } from "@/lib/store/ITreeNode"

export interface IHoverTarget extends ITreeNode {
  index: number
  direction: "up" | "down"
  depth: number
}
// Define the state shape
interface FolderState {
  folders: Record<string, boolean>
  toggleFolder: (id: string) => void
  closeFolder: (id: string) => void
  currentCut: string | null
  setCut: (id: string | null) => void
  targetFolderId: string | null
  setTargetFolderId: (id: string | null) => void

  // const [target, setTarget] = useState<{
  //   index: number
  //   direction: "up" | "down"
  // } | null>(null)
  target: IHoverTarget | null
  setTarget: (target: IHoverTarget | null) => void
}

// Create the Zustand store
export const useFolderStore = create<FolderState>((set) => ({
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
