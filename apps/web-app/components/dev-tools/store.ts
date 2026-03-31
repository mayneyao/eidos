import { create } from "zustand"
import { persist } from "zustand/middleware"

interface DevToolsState {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
  toggle: () => void
}

export const useDevToolsStore = create<DevToolsState>()(
  persist(
    (set, get) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
      toggle: () => set({ enabled: !get().enabled }),
    }),
    {
      name: "eidos-devtools-enabled",
      getStorage: () => localStorage,
    }
  )
)
