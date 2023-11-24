import { useState } from "react"
import { IScript } from "@/worker/meta_table/script"

import { stringify } from "@/lib/sqlite/helper"
import { useSqlite } from "@/hooks/use-sqlite"

export const useScript = () => {
  const { sqlite } = useSqlite()
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
    await sqlite.updateScript(stringify(script))
    console.log("updateScript", script)
  }
  return {
    addScript,
    deleteScript,
    updateScript,
  }
}

export const useGithubScriptContent = () => {
  const [content, setContent] = useState<string | null>(null)
  const [script, setScript] = useState<IScript>()
  const [loading, setLoading] = useState(false)

  const getRawUrl = (url: string, branch: string = "main") => {
    const urlParts = url.split("/")
    urlParts.splice(5, 0, branch)
    return urlParts
      .join("/")
      .replace("github.com", "raw.githubusercontent.com")
      .replace("/blob", "")
  }
  const fetchContent = async (url: string) => {
    try {
      setLoading(true)
      const eidosUrl = getRawUrl(url) + "/eidos.json"
      const response = await fetch(eidosUrl)
      const eidosData = await response.json()
      const mainUrl = getRawUrl(url) + "/" + eidosData.main
      const mainResponse = await fetch(mainUrl)
      const mainData = await mainResponse.text()
      setContent(mainData)
      setScript({
        ...eidosData,
        code: mainData,
      })
      setLoading(false)
      return {
        ...eidosData,
        code: mainData,
      }
    } catch (error) {
      console.error("Failed to fetch file content: ", error)
    }
  }

  return {
    fetchContent,
    content,
    script,
    loading,
  }
}
