import { useState } from "react"
import { IScript } from "@/worker/meta_table/script"

import { stringify } from "@/lib/sqlite/helper"
import { useSqlite } from "@/hooks/use-sqlite"

export const useScript = () => {
  const { sqlite } = useSqlite()
  const [installLoading, setInstallLoading] = useState(false)

  const addScript = async (script: IScript) => {
    if (!sqlite) return
    await sqlite.addScript(stringify(script))
    console.log("addScript", script)
  }
  const deleteScript = async (id: string) => {
    if (!sqlite) return
    await sqlite.deleteScript(id)
    console.log("deleteScript", id)
  }
  const updateScript = async (script: IScript) => {
    if (!sqlite) return
    await sqlite.script.set(script.id, stringify(script))
    console.log("updateScript", script)
  }
  const installScript = async (script: IScript) => {
    setInstallLoading(true)
    script && (await addScript(script))
    setInstallLoading(false)
  }
  const enableScript = async (id: string) => {
    if (!sqlite) return
    await sqlite.enableScript(id)
    console.log("enableScript", id)
  }
  const disableScript = async (id: string) => {
    if (!sqlite) return
    await sqlite.disableScript(id)
    console.log("disableScript", id)
  }
  return {
    addScript,
    deleteScript,
    updateScript,
    installScript,
    installLoading,
    enableScript,
    disableScript,
  }
}
