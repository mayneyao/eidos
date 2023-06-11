import { CompactSelection, GridSelection } from "@glideapps/glide-data-grid"
import { create } from "zustand"

// import { devtools, persist } from 'zustand/middleware'

interface ITableAppState {
  isAddFieldEditorOpen: boolean
  setIsAddFieldEditorOpen: (isAddFieldEditorOpen: boolean) => void
  selectedFieldType: string
  setSelectedFieldType: (selectedFieldType: string) => void

  selection: GridSelection
  setSelection: (selection: GridSelection) => void

  clearSelection: () => void
}

export const useTableAppStore = create<ITableAppState>()((set) => ({
  isAddFieldEditorOpen: false,
  setIsAddFieldEditorOpen: (isAddFieldEditorOpen) =>
    set({ isAddFieldEditorOpen }),
  selectedFieldType: "",
  setSelectedFieldType: (selectedFieldType) => set({ selectedFieldType }),

  selection: {
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  },
  setSelection: (selection) => set({ selection }),
  clearSelection: () =>
    set({
      selection: {
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
      },
    }),
}))
