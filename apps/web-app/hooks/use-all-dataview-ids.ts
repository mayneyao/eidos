import { useCallback, useEffect } from "react"
import { useSqlite } from "./use-sqlite"
import { useDataViewStore } from "@/apps/web-app/store/dataview-store"
import { useCurrentPathInfo } from "./use-current-pathinfo"

export const useAllDataViewIds = () => {
    const { sqlite } = useSqlite()
    const { dataViewIds, setDataViewIds, setReloadFunction } = useDataViewStore()
    const { space } = useCurrentPathInfo()
    const reload = useCallback(async () => {
        if (!sqlite) return
        const views = await sqlite.dataView.getAllDataViewIds()
        setDataViewIds(views)
    }, [sqlite, setDataViewIds])

    useEffect(() => {
        if (!sqlite) return
        reload()
    }, [sqlite, reload, space])

    useEffect(() => {
        setReloadFunction(reload)
    }, [reload, setReloadFunction])

    return {
        dataViewIds,
        reload
    }
}