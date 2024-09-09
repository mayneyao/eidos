import { isDesktopMode } from "@/lib/env"
import { EidosFileSystemManager } from "@/lib/storage/eidos-file-system"

export const useEidosFileSystemManager = () => {
    const efsManager = isDesktopMode ? window.eidos.efsManager : new EidosFileSystemManager()
    return {
        efsManager
    }
}