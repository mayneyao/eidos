"use client"

import { create } from "zustand"

interface DataViewState {
  dataViewIds: string[]
  setDataViewIds: (ids: string[]) => void
  addDataViewId: (id: string) => void
  removeDataViewId: (id: string) => void
  reload: () => Promise<void>
  setReloadFunction: (fn: () => Promise<void>) => void
}

export const useDataViewStore = create<DataViewState>()((set, get) => ({
  dataViewIds: [],
  setDataViewIds: (ids) => set({ dataViewIds: ids }),
  
  addDataViewId: (id) => {
    const { dataViewIds } = get()
    if (!dataViewIds.includes(id)) {
      set({ dataViewIds: [...dataViewIds, id] })
    }
  },
  
  removeDataViewId: (id) => {
    const { dataViewIds } = get()
    set({ dataViewIds: dataViewIds.filter(viewId => viewId !== id) })
  },
  
  reload: async () => {
    // This will be set by the hook
    const { reload } = get()
    if (reload) {
      await reload()
    }
  },
  
  setReloadFunction: (fn) => set({ reload: fn }),
}))
