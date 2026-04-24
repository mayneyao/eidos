import { isDesktopMode } from "@/lib/env"
import { create } from "zustand"

type UpdateStatus =
  | "checking"
  | "available"
  | "not-available"
  | "error"
  | "progress"
  | "downloaded"
  | "idle"

interface UpdateInfo {
  version: string
  releaseDate: string
  releaseNotes: string
}

interface UpdateProgress {
  bytesPerSecond: number
  percent: number
  transferred: number
  total: number
}

interface UpdateStore {
  updateStatus: UpdateStatus
  updateInfo: UpdateInfo | null
  updateProgress: UpdateProgress | null
  updateError: string | null
  checkForUpdates: () => void
  quitAndInstall: () => void
}

// Create Zustand store
const useUpdateStore = create<UpdateStore>((set) => ({
  updateStatus: "idle",
  updateInfo: null,
  updateProgress: null,
  updateError: null,

  checkForUpdates: () => {
    if (isDesktopMode) {
      useUpdateStore.setState({ updateStatus: "checking" })
      window.eidos.checkForUpdates()
    }
  },

  quitAndInstall: () => {
    if (isDesktopMode) {
      window.eidos.quitAndInstall()
    }
  },
}))

// Initialize store and event listeners
if (
  typeof window !== "undefined" &&
  isDesktopMode &&
  !(window as any).__updateStoreInitialized
) {
  ;(window as any).__updateStoreInitialized = true

  const handleUpdateStatus = (status: UpdateStatus, data?: any) => {
    switch (status) {
      case "available":
      case "downloaded":
        useUpdateStore.setState({ updateStatus: status, updateInfo: data })
        break
      case "progress":
        useUpdateStore.setState({ updateStatus: status, updateProgress: data })
        break
      case "error":
        useUpdateStore.setState({
          updateStatus: status,
          updateError: data.message || "Unknown error",
        })
        break
      default:
        useUpdateStore.setState({ updateStatus: status })
        break
    }
  }

  window.eidos?.on(
    "update-status",
    (event: any, status: UpdateStatus, data?: any) => {
      handleUpdateStatus(status, data)
    }
  )
}

// Export hook
export const useUpdateStatus = () => useUpdateStore()
