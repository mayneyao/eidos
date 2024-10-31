import { useEffect, useState } from "react"

import { useSqlite } from "./use-sqlite"
import { IScript } from "@/worker/web-worker/meta-table/script"

export const useMblock = (id?: string) => {
    const [block, setBlock] = useState<IScript | null>(null)
    const { sqlite } = useSqlite()
    useEffect(() => {
        if (!sqlite || !id) {
            return
        }
        sqlite.script.get(id).then(setBlock)
    }, [sqlite, id])
    return block
}