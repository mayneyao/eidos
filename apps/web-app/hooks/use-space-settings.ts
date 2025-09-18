import { useSqliteKV } from "./use-sqlite-kv"
import { useSqlite } from "./use-sqlite"
import { useCallback } from "react"


export interface SpaceDocSettings {
    markerProperty: string
    showReferenceNodeIcon: boolean
}

export interface SpaceSettings {
    doc: SpaceDocSettings
}


export const useSpaceSettings = (scope: 'doc', defaultSettings: any) => {
    const { sqlite } = useSqlite()
    const spaceSettings = useSqliteKV<SpaceSettings>(`eidos:space:settings:${scope}`, defaultSettings)

    const update = useCallback(async (newSettings: any) => {
        if (!sqlite) return
        await sqlite.kv.put(`eidos:space:settings:${scope}`, newSettings)
    }, [sqlite])

    const safeSettings = spaceSettings ? {
        ...defaultSettings,
        ...spaceSettings
    } : defaultSettings

    return {
        data: safeSettings,
        update
    }
}