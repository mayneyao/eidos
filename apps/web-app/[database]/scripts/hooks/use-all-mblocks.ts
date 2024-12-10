import { useCallback, useEffect } from "react"
import { useSqlite } from "@/hooks/use-sqlite"

import { create } from 'zustand'
import { IScript } from "@/worker/web-worker/meta-table/script"

interface MblocksState {
    mblocks: IScript[]
    setMblocks: (mblocks: IScript[]) => void
}

export const useMblocksStore = create<MblocksState>((set) => ({
    mblocks: [],
    setMblocks: (mblocks) => set({ mblocks }),
}))

export const useAllMblocks = () => {
    const { sqlite } = useSqlite()
    const { mblocks, setMblocks } = useMblocksStore()
    const fetchMblocks = useCallback(async () => {
        if (!sqlite) return
        const blocks = await sqlite?.script.list({
            type: "m_block",
            enabled: true,
        })
        setMblocks(blocks)
    }, [sqlite, setMblocks])

    useEffect(() => {
        fetchMblocks()
    }, [sqlite, fetchMblocks])

    const reload = () => {
        fetchMblocks()
    }
    return {
        mblocks,
        reload,
    }
}
