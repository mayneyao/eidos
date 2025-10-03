import type {
  GridSelection,
  Rectangle
} from "@glideapps/glide-data-grid";
import {
  CompactSelection
} from "@glideapps/glide-data-grid"
import { create } from "zustand"

import type { IField } from "@/packages/core/types/IField"

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


  selection: GridSelection
  setSelection: (selection: GridSelection) => void
  clearSelection: () => void

  menu?: IMenu
  setMenu: (menu?: IMenu) => void

  currentUiColumn?: IField
  setCurrentUiColumn: (currentUiColumn?: IField) => void

  fieldInsertPosition?: number
  setFieldInsertPosition: (position?: number) => void

  // const [currentPreviewIndex, setCurrentPreviewIndex] = useState(-1)
  currentPreviewIndex: number
  setCurrentPreviewIndex: (currentPreviewIndex: number) => void

  // added row by click on add row button
  addedRowIds: Set<string>
  addAddedRowId: (rowId: string) => void
  removeAddedRowId: (rowId: string) => void
  clearAddedRowIds: () => void
}

// Store factory function
export const createTableStore = () => create<ITableAppState>()((set) => ({
  isAddFieldEditorOpen: false,
  setIsAddFieldEditorOpen: (isAddFieldEditorOpen) =>
    set({ isAddFieldEditorOpen }),

  isFieldPropertiesEditorOpen: false,
  setIsFieldPropertiesEditorOpen: (isFieldPropertiesEditorOpen) => {
    set({ isFieldPropertiesEditorOpen })
  },


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

  fieldInsertPosition: undefined,
  setFieldInsertPosition: (position) => set({ fieldInsertPosition: position }),

  currentPreviewIndex: -1,
  setCurrentPreviewIndex: (currentPreviewIndex) => set({ currentPreviewIndex }),

  addedRowIds: new Set(),
  addAddedRowId: (rowId) => {
    set((state) => {
      return {
        ...state,
        addedRowIds: new Set(state.addedRowIds).add(rowId),
      }
    })
  },
  removeAddedRowId: (rowId) => {
    set((state) => {
      const addedRowIds = new Set(state.addedRowIds)
      addedRowIds.delete(rowId)
      return {
        ...state,
        addedRowIds,
      }
    })
  },
  clearAddedRowIds: () => {
    set((state) => {
      return {
        ...state,
        addedRowIds: new Set(),
      }
    })
  },
}))

// Export the store factory and types for use in components
export type { ITableAppState, IMenu }
