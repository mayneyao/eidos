import { isDesktopMode } from "@/lib/env"
import { useEffect, useState } from "react"

export const useDataFolderCheck = () => {
    const [isDataFolderSet, setIsDataFolderSet] = useState<boolean>(window.eidos.isDataFolderSet)

    useEffect(() => {
        const checkDataFolder = async () => {
            const dataFolder = await window.eidos.config.get("dataFolder")
            setIsDataFolderSet(!!dataFolder)
        }

        checkDataFolder()
    }, [])

    return isDataFolderSet
}

interface PlaygroundFile {
    name: string;
    content: string;
}

interface PlaygroundOptions {
    onChange: (filename: string, content: string, space: string, blockId: string) => void
}
export const usePlayground = ({ onChange }: PlaygroundOptions) => {

    const initializePlayground = async (space: string, blockId: string, files: PlaygroundFile[]) => {
        if (!isDesktopMode) {
            return
        }
        return await window.eidos.initializePlayground(space, blockId, files)
    }

    useEffect(() => {
        if (!isDesktopMode) {
            return
        }
        const handlePlaygroundFileChanged = (event: any, data: { filename: string, content: string, space: string, blockId: string }) => {
            onChange(data.filename, data.content, data.space, data.blockId)
        }
        window.eidos.on('playground-file-changed', handlePlaygroundFileChanged)
        return () => {
            window.eidos.off('playground-file-changed', handlePlaygroundFileChanged)
        }
    }, [])

    return {
        initializePlayground
    }
}