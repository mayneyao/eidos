import { create } from 'zustand'
// import { devtools, persist } from 'zustand/middleware'

interface ITableAppState {
  isAddFieldEditorOpen: boolean
  setIsAddFieldEditorOpen: (isAddFieldEditorOpen: boolean) => void
  selectedFieldType: string
  setSelectedFieldType: (selectedFieldType: string) => void
}

export const useTableAppStore = create<ITableAppState>()(
  (set) => ({
    isAddFieldEditorOpen: false,
    setIsAddFieldEditorOpen: (isAddFieldEditorOpen) => set({ isAddFieldEditorOpen }),
    selectedFieldType: '',
    setSelectedFieldType: (selectedFieldType) => set({ selectedFieldType }),
  }),
)