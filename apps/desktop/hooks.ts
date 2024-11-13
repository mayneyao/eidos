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

export const usePlayground = ({ onChange }: { onChange: (filename: string, content: string) => void }) => {

    const initializePlayground = async (space: string, blockId: string, files: PlaygroundFile[]) => {
        return await window.eidos.initializePlayground(space, blockId, files)
    }

    useEffect(() => {
        const handlePlaygroundFileChanged = (event: any, data: { filename: string, content: string }) => {
            onChange(data.filename, data.content)
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