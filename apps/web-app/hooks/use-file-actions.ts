import { useMemo } from "react"
import type { FileActionMeta } from "@/packages/core/types/IExtension"
import { useAllFileActions } from "./use-all-file-actions"

/**
 * Hook to query file actions that support a specific file extension
 */
export const useFileActions = (fileExtension: string) => {
    const { fileActions, loading } = useAllFileActions()

    const actions = useMemo(() => {
        if (!fileExtension) return []

        return fileActions.filter((action) => {
            const meta = action.meta as FileActionMeta
            if (!meta.fileAction?.extensions) return false
            return meta.fileAction.extensions.includes("*") || meta.fileAction.extensions.includes(fileExtension)
        })
    }, [fileActions, fileExtension])

    return { fileActions: actions, isLoading: loading }
}
