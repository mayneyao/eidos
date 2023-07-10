import {
  CompactSelection,
  GridSelection,
  Rectangle,
} from "@platools/glide-data-grid"
import { create } from "zustand"

import { IUIColumn } from "@/hooks/use-table"

// import { devtools, persist } from 'zustand/middleware'

interface IMenu {
  col: number
  bounds: Rectangle
}

interface ITableAppState {
  isAddFieldEditorOpen: boolean
  setIsAddFieldEditorOpen: (isAddFieldEditorOpen: boolean) => void

  isFieldPropertiesEditorOpen: boolean
  setIsFieldPropertiesEditorOpen: (isFieldPropertiesEditorOpen: boolean) => void

  selectedFieldType: string
  setSelectedFieldType: (selectedFieldType: string) => void

  selection: GridSelection
  setSelection: (selection: GridSelection) => void
  clearSelection: () => void

  menu?: IMenu
  setMenu: (menu?: IMenu) => void

  currentUiColumn?: IUIColumn
  setCurrentUiColumn: (currentUiColumn?: IUIColumn) => void
}

export const useTableAppStore = create<ITableAppState>()((set) => ({
  isAddFieldEditorOpen: false,
  setIsAddFieldEditorOpen: (isAddFieldEditorOpen) =>
    set({ isAddFieldEditorOpen }),

  isFieldPropertiesEditorOpen: false,
  setIsFieldPropertiesEditorOpen: (isFieldPropertiesEditorOpen) => {
    set({ isFieldPropertiesEditorOpen })
  },

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

  menu: undefined,
  setMenu: (menu) => set({ menu }),

  currentUiColumn: undefined,
  setCurrentUiColumn: (currentUiColumn) => set({ currentUiColumn }),
}))
