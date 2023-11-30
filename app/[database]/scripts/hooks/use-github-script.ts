import { useState } from "react"
import { IScript } from "@/worker/meta_table/script"

export const getRawUrl = (url: string, branch: string = "main") => {
  const urlParts = url.split("/")
  urlParts.splice(5, 0, branch)
  return urlParts
    .join("/")
    .replace("github.com", "raw.githubusercontent.com")
    .replace("/blob", "")
}

export const useGithubScriptContent = () => {
  const [content, setContent] = useState<string | null>(null)
  const [script, setScript] = useState<IScript>()
  const [loading, setLoading] = useState(false)

  const fetchContent = async (url: string) => {
    try {
      setLoading(true)
      const eidosUrl = getRawUrl(url) + "/eidos.json"
      const response = await fetch(eidosUrl)
      const eidosData = await response.json()
      const { main, ...restEidosData } = eidosData
      const mainUrl = getRawUrl(url) + "/" + main
      const mainResponse = await fetch(mainUrl)
      const mainData = await mainResponse.text()
      setContent(mainData)
      setScript({
        ...restEidosData,
        code: mainData,
      })
      setLoading(false)
      return {
        ...restEidosData,
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
