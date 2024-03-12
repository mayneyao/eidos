import { create } from "zustand"

export const useEditorStore = create<{
  isToolbarVisible: boolean
  setIsToolbarVisible: (isToolbarVisible: boolean) => void
}>((set) => ({
  isToolbarVisible: true,
  setIsToolbarVisible: (isToolbarVisible) => set({ isToolbarVisible }),
}))
