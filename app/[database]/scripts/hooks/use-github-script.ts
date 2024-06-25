import { useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"

import { DOMAINS } from "@/lib/const"

export const getRawUrl = (url: string, branch: string = "main") => {
  const urlParts = url.split("/")
  urlParts.splice(5, 0, branch)
  return urlParts
    .join("/")
    .replace("github.com", "raw.githubusercontent.com")
    .replace("/blob", "")
}

// FIXME: handle CORS issue
export async function downloadLatestRelease(repoName: string) {
  const apiUrl = `https://api.github.com/repos/${repoName}/releases/latest`

  try {
    // Step 2: Fetch the latest release information
    const response = await fetch(apiUrl)
    if (!response.ok) {
      throw new Error(`GitHub API responded with status ${response.status}`)
    }
    const releaseInfo = await response.json()

    // Step 3: Extract the download URL for the asset
    const asset = releaseInfo.assets[0] // Assuming we want the first asset
    if (!asset) {
      throw new Error("No assets found in the latest release.")
    }
    const downloadUrl = asset.browser_download_url

    // Step 4: Download the asset
    const downloadResponse = await fetch(downloadUrl)
    if (!downloadResponse.ok) {
      throw new Error(
        `Failed to download the asset: ${downloadResponse.status}`
      )
    }
    // Assuming the asset is a file that needs to be saved locally
    const fileBlob = await downloadResponse.blob()
    const filename = asset.name
    return new File([fileBlob], filename, {
      type: asset.content_type,
    })
  } catch (error) {
    console.error("Failed to download the latest release:", error)
  }
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
