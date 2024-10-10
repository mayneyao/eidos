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
