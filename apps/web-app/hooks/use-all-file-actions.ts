import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import type { EidosDataEventChannelMsg } from "@/lib/const"
import {
    DataUpdateSignalType,
    EidosDataEventChannelMsgType,
    EidosDataEventChannelName,
} from "@/lib/const"
import { ExtensionTableName } from "@/packages/core/sqlite/const"
import type { IExtension, FileActionMeta } from "@/packages/core/types/IExtension"
import { ScriptExtensionType } from "@/packages/core/types/IExtension"
import { useCallback, useEffect } from "react"
import { create } from "zustand"

const useAllFileActionsStore = create<{
    fileActions: IExtension<FileActionMeta>[]
    loading: boolean
    setFileActions: (actions: IExtension<FileActionMeta>[]) => void
    addFileAction: (action: IExtension<FileActionMeta>) => void
    updateFileAction: (action: IExtension<FileActionMeta>) => void
    removeFileAction: (id: string) => void
    setLoading: (loading: boolean) => void
    reload?: () => Promise<void>
    setReload: (reload: () => Promise<void>) => void
}>((set) => ({
    fileActions: [],
    loading: false,
    setFileActions: (actions) => set({ fileActions: actions }),
    addFileAction: (action) =>
        set((state) => {
            const existingIndex = state.fileActions.findIndex((a) => a.id === action.id)
            if (existingIndex !== -1) {
                return {
                    fileActions: state.fileActions.map((a) =>
                        a.id === action.id ? action : a
                    ),
                }
            }
            return {
                fileActions: [...state.fileActions, action],
            }
        }),
    updateFileAction: (action) =>
        set((state) => ({
            fileActions: state.fileActions.map((a) =>
                a.id === action.id ? action : a
            ),
        })),
    removeFileAction: (id) =>
        set((state) => ({
            fileActions: state.fileActions.filter((a) => a.id !== id),
        })),
    setLoading: (loading) => set({ loading }),
    setReload: (reload) => set({ reload }),
}))

/**
 * Hook to sync file action extensions from database changes
 * Listens to extension table changes and updates the store
 */
export const useSyncFileActions = () => {
    const { sqlite } = useSqlite()
    const {
        setFileActions,
        addFileAction,
        updateFileAction,
        removeFileAction,
        setLoading,
        setReload,
    } = useAllFileActionsStore()

    const reload = useCallback(async () => {
        if (!sqlite) return

        setLoading(true)
        try {
            const allExtensions = await sqlite.extension.list()
            const fileActions = allExtensions.filter(
                (ext): ext is IExtension<FileActionMeta> => {
                    return ext.meta?.type === ScriptExtensionType.FileAction
                }
            )
            setFileActions(fileActions)
        } catch (error) {
            console.error("Failed to fetch file actions:", error)
            setFileActions([])
        } finally {
            setLoading(false)
        }
    }, [sqlite, setFileActions, setLoading])

    // Register reload function in store
    useEffect(() => {
        setReload(reload)
    }, [reload, setReload])

    // Initial load
    useEffect(() => {
        reload()
    }, [reload])

    // Listen to extension table changes
    useEffect(() => {
        const bc = new BroadcastChannel(EidosDataEventChannelName)

        const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
            const { type, payload } = ev.data
            if (type === EidosDataEventChannelMsgType.MetaTableUpdateSignalType) {
                const { table, _new, _old, type: updateType } = payload
                if (table !== ExtensionTableName) return

                try {
                    switch (updateType) {
                        case DataUpdateSignalType.Insert:
                        case DataUpdateSignalType.Update:
                            if (_new) {
                                // Parse meta if it's a string
                                const meta =
                                    typeof _new.meta === "string"
                                        ? JSON.parse(_new.meta)
                                        : _new.meta

                                if (meta?.type === ScriptExtensionType.FileAction) {
                                    const extension = {
                                        ..._new,
                                        meta,
                                    } as unknown as IExtension<FileActionMeta>

                                    if (updateType === DataUpdateSignalType.Insert) {
                                        addFileAction(extension)
                                    } else {
                                        updateFileAction(extension)
                                    }
                                } else {
                                    // If it was a file action before but now isn't, remove it
                                    if (_old) {
                                        const oldMeta =
                                            typeof _old.meta === "string"
                                                ? JSON.parse(_old.meta)
                                                : _old.meta
                                        if (oldMeta?.type === ScriptExtensionType.FileAction) {
                                            removeFileAction(_old.id)
                                        }
                                    }
                                }
                            }
                            break

                        case DataUpdateSignalType.Delete:
                            if (_old?.id) {
                                // Parse meta if it's a string
                                const meta =
                                    typeof _old.meta === "string"
                                        ? JSON.parse(_old.meta)
                                        : _old.meta

                                if (meta?.type === ScriptExtensionType.FileAction) {
                                    removeFileAction(_old.id)
                                }
                            }
                            break
                        default:
                            break
                    }
                } catch (error) {
                    console.warn("Failed to parse extension meta:", error)
                }
            }
        }

        bc.addEventListener("message", handler)
        return () => {
            bc.removeEventListener("message", handler)
            bc.close()
        }
    }, [addFileAction, updateFileAction, removeFileAction])
}

/**
 * Hook to get all file action extensions
 * Automatically syncs with database changes
 */
export const useAllFileActions = () => {
    const fileActions = useAllFileActionsStore((state) => state.fileActions)
    const loading = useAllFileActionsStore((state) => state.loading)
    const reload = useAllFileActionsStore((state) => state.reload)

    return {
        fileActions,
        loading,
        reload,
    }
}
