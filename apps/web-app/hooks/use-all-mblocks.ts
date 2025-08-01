import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import type { EidosDataEventChannelMsg } from "@/lib/const";
import { DataUpdateSignalType, EidosDataEventChannelMsgType, EidosDataEventChannelName } from "@/lib/const"
import { ScriptTableName } from "@/packages/core/sqlite/const"
import type { IExtension } from "@/packages/core/meta-table/extension"
import { useCallback, useEffect } from "react"
import { create } from "zustand"



const useMblockStore = create<{
    mblocks: IExtension[]
    loading: boolean
    setMblocks: (mblocks: IExtension[]) => void
    setLoading: (loading: boolean) => void
}>((set) => ({
    mblocks: [],
    loading: false,
    setMblocks: (mblocks: IExtension[]) => set({ mblocks }),
    setLoading: (loading: boolean) => set({ loading }),
}))

export const useSyncMblocks = () => {
    const { sqlite } = useSqlite()
    const { mblocks, setMblocks, setLoading } = useMblockStore()

    const reload = useCallback(async () => {
        setLoading(true)
        if (!sqlite) return
        const mblocks = await sqlite.extension.list({
            type: "block",
            enabled: true,
        }, {
            fields: ["id", "name", "icon", "type", "enabled", "created_at", "updated_at"]
        })
        setMblocks(mblocks)
        setLoading(false)
    }, [sqlite])


    // const removeItem = useCallback((id: string) => {
    //     setMblocks(mblocks.filter(mblock => mblock.id !== id))
    // }, [])

    // const addItem = useCallback((mblock: IExtension) => {
    //     setMblocks([...mblocks, mblock])
    // }, [])

    // const updateItem = useCallback((_mblock: IExtension) => {
    //     setMblocks(mblocks.map(mblock => mblock.id === _mblock.id ? _mblock : mblock))
    // }, [])

    useEffect(() => {

        reload()

        const bc = new BroadcastChannel(EidosDataEventChannelName)

        const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
            const { type, payload } = ev.data
            if (type === EidosDataEventChannelMsgType.MetaTableUpdateSignalType) {
                const { table, _new, _old, type: updateType } = payload
                if (table !== ScriptTableName || (_old?.type !== "block" || _new?.type !== "block")) return

                // when data is updated, we need to reload the data from the database. it's simple but not efficient.
                // we should use a more efficient way to update the data.
                switch (updateType) {
                    case DataUpdateSignalType.Insert:
                        reload()
                        break

                    case DataUpdateSignalType.Update:
                        reload()
                        break

                    case DataUpdateSignalType.Delete:
                        reload()
                        break
                    default:
                        break
                }
            }
        }

        bc.addEventListener("message", handler)
        return () => {
            bc.removeEventListener("message", handler)
            bc.close()
        }
    }, [sqlite, reload])

}

export const useAllMblocks = () => {
    const { sqlite } = useSqlite()

    const { mblocks, loading, setMblocks, setLoading } = useMblockStore()

    const reload = useCallback(async () => {
        setLoading(true)
        if (!sqlite) return
        const mblocks = await sqlite.extension.list({
            type: "block",
            enabled: true,
        }, {
            fields: ["id", "name", "icon", "type", "enabled", "created_at", "updated_at"]
        })
        setMblocks(mblocks)
        setLoading(false)
    }, [sqlite])


    return {
        mblocks,
        loading,
        reload
    }
}
