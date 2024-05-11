import { RangeSelection } from "lexical"
import { create } from "zustand"

export const useEditorStore = create<{
  isToolbarVisible: boolean
  setIsToolbarVisible: (isToolbarVisible: boolean) => void
  aiSelection: RangeSelection | null
  setAISelection: (aiSelection: RangeSelection | null) => void
  isAIToolsOpen: boolean
  setIsAIToolsOpen: (isAIToolsOpen: boolean) => void
}>((set) => ({
  isToolbarVisible: true,
  setIsToolbarVisible: (isToolbarVisible) => set({ isToolbarVisible }),
  aiSelection: null,
  setAISelection: (aiSelection) => set({ aiSelection }),
  isAIToolsOpen: false,
  setIsAIToolsOpen: (isAIToolsOpen) => set({ isAIToolsOpen }),
}))
