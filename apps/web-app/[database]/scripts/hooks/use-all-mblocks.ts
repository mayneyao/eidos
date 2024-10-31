import { useEffect, useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"

import { useSqlite } from "@/hooks/use-sqlite"

export const useAllMblocks = () => {
    const { sqlite } = useSqlite()

    const [mblocks, setMblocks] = useState<IScript[]>([])
    useEffect(() => {
        if (!sqlite) {
            return
        }
        const fetchMblocks = async () => {
            const mblocks = await sqlite?.script.list({
                type: "m_block",
                enabled: true,
            })
            setMblocks(mblocks)
        }
        fetchMblocks()
    }, [sqlite])

    return mblocks
}
